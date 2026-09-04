#!/usr/bin/env bash
# P7 / 7.B — do ba duong dung cluster-trong-pod, tren cum THAT.
#
# Chay TREN HOST (node debian-sandbox), khong chay trong pod.
#
# Vi sao do o cgroup cua HOST chu khong `kubectl exec ... free -m`:
# Sysbox bien tap thu tien trinh trong pod nhin thay (/proc/meminfo la cua
# node chu khong phai cua cgroup), nen moi phep do TU TRONG pod deu sai. Va
# container long do dockerd ben trong tao ra nam DUOI cgroup cua pod tren host
# — nen chi cgroup muc pod moi cong du phan cluster con.
#
# workingSet = memory.current - inactive_file. Day la so kubelet dung de evict;
# memory.current tho gop ca page cache cua `docker pull`, thu se boc hoi khi co
# ap luc, nen dat requests theo no la giu cho cho thu khong ton tai.
#
# Mang: namespace do duoc sao chep NGUYEN 4 NetworkPolicy cua dlp-sandbox, nen
# "co can registry.k8s.io khong" duoc tra loi bang QUAN SAT (treo duoi
# deny-all), khong bang suy luan.
set -uo pipefail

NS=${NS:-dlp-p7}
SRC_NS=${SRC_NS:-dlp-sandbox}
# ⚠ PHAI LA IMAGE MA ORCHESTRATOR THAT SU CAP CHO PHIEN.
#
# Doc no tu Helm, dung ghi tay:  helm get values platform -o yaml
#   -> orchestrator.env.sandboxImage
#
# Mac dinh cu ghim `sha-2b79fd3`, mot tag CO TRUOC P7 va vi the KHONG co
# `dlp-k8s-wait` lan `start_k8s`. Hau qua khong he on ao: pod len Ready,
# moi lenh tra ve 0, harness lay mau du 2 giay mot lan va in ra mot bao cao
# hoan chinh — cua MOT POD KHONG CO CLUSTER NAO. Da mat hai luot do vi dung
# cai mac dinh nay (2026-09-04). Do la ly do co `assert_k8s_capable` ben
# duoi: mot phep do phai chet to khi tien de cua no sai.
IMAGE=${IMAGE:-ghcr.io/nghaiz/dlp-sandbox-base:p7-k8s3}
MIRROR=${MIRROR:-http://platform-registry-mirror.dlp-registry.svc.cluster.local:5000}
BIN_DIR=${BIN_DIR:-$HOME/p7}
OUT_DIR=${OUT_DIR:-$HOME/p7/out}
K3S_TAG=${K3S_TAG:-v1.34.1-k3s1}
# Token chi song trong mot lan do. San xuat SINH token moi phien (xem
# `start_k8s`); ghim mot hang so o day la chap nhan duoc VI day la harness do,
# va viec ghim no lam lan do lap lai duoc.
K3S_MEASURE_TOKEN=${K3S_MEASURE_TOKEN:-dlp-measure-token}
KIND_NODE_IMAGE=${KIND_NODE_IMAGE:-kindest/node:v1.34.0}
# Tran do CO Y rong (6Gi/4cpu): muc dich la tim DINH THAT roi moi dat profile.
# Do duoi tran cua profile la do cai tran, khong phai do nhu cau.
MEM_LIMIT=${MEM_LIMIT:-6Gi}
CPU_LIMIT=${CPU_LIMIT:-4}
SAMPLE_SEC=${SAMPLE_SEC:-2}

variant=${1:?usage: p7-measure.sh <baseline|k3s|k3s-lab|k3s-heavy-lab|k3s-2node|k3s-2node-lab|kind> [ready-timeout-sec]}
READY_TIMEOUT=${2:-600}
POD="p7-$variant"
mkdir -p "$OUT_DIR"

# `k3s-lab` do DUONG SAN XUAT: khong `docker run` tay, ma dat DLP_K8S=1 roi de
# `start_k8s` cua entrypoint image tu dung cluster — dung nhu mot phien that.
# Cac variant khac giu duong cu (docker run tay) vi chung can mount ban
# k3s-boot.sh TU HOST de do code CHUA nam trong image.
POD_EXTRA_ENV=""
case "$variant" in
  k3s-lab | k3s-heavy-lab)
    POD_EXTRA_ENV=$'\n        - name: DLP_K8S\n          value: "1"'
    ;;
  k3s-2node-lab)
    # 2 node DUOI TAI, tren duong san xuat. `dlp-k8s-wait` doc CHINH bien
    # DLP_K8S_NODES nay, nen phep CHO va phep DUNG khong the lech nhau —
    # neu chung lech, harness se bao READY luc moi co 1 node va con so tra
    # ve la con so cua mot cum 1 node deo nhan 2 node.
    POD_EXTRA_ENV=$'\n        - name: DLP_K8S\n          value: "1"\n        - name: DLP_K8S_NODES\n          value: "2"'
    ;;
esac

# Moc "cluster vua Ready", de tach phan CLUSTER khoi phan TAI trong bao cao.
# Khong co moc nay thi mot dinh 900 MiB khong noi duoc bao nhieu la cluster va
# bao nhieu la bai hoc — tuc khong dat duoc profile tu no.
#
# ⚠ Ghi qua FILE, khong qua bien. `setup_log=$(setup_k3s_lab)` chay ham trong
# mot SUBSHELL, nen mot phep gan bien ben trong khong bao gio ra toi main —
# luot do dau tien (2026-09-04) vi the tra ve `workingSetAtReadyMiB: null`
# trong khi moi thu khac deu dung. Mot truong null thi con de thay; cai dang so
# la neu no da co gia tri mac dinh 0, bao cao se in ra mot con so SAI ma trong
# nhu that.
T_READY_FILE="$OUT_DIR/$variant.tready"
rm -f "$T_READY_FILE"

log() { printf '[%s] %s\n' "$(date -u +%H:%M:%S)" "$*" >&2; }

ensure_ns() {
  kubectl get ns "$NS" >/dev/null 2>&1 || kubectl create ns "$NS" >/dev/null
  # Sao chep NGUYEN VAN netpol cua sandbox — chung deu podSelector:{} va tro
  # sang namespace khac BANG NHAN, nen doi namespace la du, khong phai sua.
  kubectl get netpol -n "$SRC_NS" -o json \
    | jq --arg ns "$NS" '.items[] | .metadata.namespace=$ns
        | del(.metadata.uid,.metadata.resourceVersion,.metadata.creationTimestamp,
              .metadata.generation,.metadata.managedFields,.metadata.annotations,
              .metadata.labels,.status)' \
    | kubectl apply -n "$NS" -f - >/dev/null
}

# ⚠ KHAC BIET DA KHAI BAO so voi production (xem docs/k8s-in-pod.md § 17-21).
#
# NetworkPolicy `platform-registry-mirror-allow-ingress-sandbox` o ns
# `dlp-registry` chi nhan ingress tu namespace TEN LA `dlp-sandbox` (qua nhan
# bat bien kubernetes.io/metadata.name). Namespace do vi the KHONG toi duoc
# mirror, va hau qua khong tro ve netpol o dau ca: dockerd trong pod khong keo
# duoc `rancher/k3s`, cluster con khong bao gio len, va harness do mot pod RONG
# trong khi moi lenh deu tra ve 0. Da mat mot lan do vi dung bay nay
# (2026-09-04).
#
# Netpol tam duoc CAP VA GO TU DONG o day thay vi bang tay: mot buoc don dep
# thu cong la mot buoc se bi quen, va thu bi quen o day la mot lo hong ingress
# vao registry cua cum.
ensure_mirror_access() {
  [ "$NS" = "$SRC_NS" ] && return 0
  kubectl apply -f - >/dev/null <<NETPOL_EOF
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: p7-measure-temp-allow-ingress
  namespace: dlp-registry
spec:
  podSelector: {}
  policyTypes: [Ingress]
  ingress:
    - from:
        - namespaceSelector:
            matchLabels:
              kubernetes.io/metadata.name: $NS
NETPOL_EOF
  log "cap netpol tam p7-measure-temp-allow-ingress (ns do = $NS -> mirror)"
}

drop_mirror_access() {
  [ "$NS" = "$SRC_NS" ] && return 0
  kubectl delete netpol -n dlp-registry p7-measure-temp-allow-ingress --ignore-not-found >/dev/null 2>&1
}

make_pod() {
  kubectl delete pod -n "$NS" "$POD" --ignore-not-found --wait=true >/dev/null 2>&1
  kubectl apply -f - >/dev/null <<POD_EOF
apiVersion: v1
kind: Pod
metadata:
  name: $POD
  namespace: $NS
  labels:
    app: p7-measure
    variant: "$variant"
spec:
  runtimeClassName: sysbox-runc
  hostUsers: false
  nodeSelector:
    sysbox-runtime: running
  automountServiceAccountToken: false
  enableServiceLinks: false
  restartPolicy: Never
  terminationGracePeriodSeconds: 30
  securityContext:
    seccompProfile:
      type: RuntimeDefault
  containers:
    - name: sandbox
      image: $IMAGE
      imagePullPolicy: IfNotPresent
      command: ["/usr/bin/tini", "--", "/usr/local/bin/dlp-entrypoint.sh", "sleep", "infinity"]
      env:
        - name: DLP_REGISTRY_MIRROR
          value: "$MIRROR"$POD_EXTRA_ENV
      resources:
        requests:
          cpu: "250m"
          memory: "256Mi"
        limits:
          cpu: "$CPU_LIMIT"
          memory: "$MEM_LIMIT"
      securityContext:
        privileged: false
        allowPrivilegeEscalation: false
        capabilities:
          drop: ["ALL"]
POD_EOF
  kubectl wait -n "$NS" --for=condition=Ready "pod/$POD" --timeout=240s >/dev/null
}

cgroup_dir() {
  local uid pat
  uid=$(kubectl get pod -n "$NS" "$POD" -o jsonpath='{.metadata.uid}')
  pat="pod${uid//-/_}"
  sudo find /sys/fs/cgroup -maxdepth 4 -type d -name "*${pat}*" 2>/dev/null | head -1
}

# Lay mau o cgroup muc POD (gop ca container long). In JSONL.
sampler() {
  local cg=$1 out=$2 cur inact cpu ts
  : > "$out"
  while :; do
    cur=$(sudo cat "$cg/memory.current" 2>/dev/null) || break
    [ -n "$cur" ] || break
    inact=$(sudo awk '/^inactive_file /{print $2}' "$cg/memory.stat" 2>/dev/null)
    cpu=$(sudo awk '/^usage_usec /{print $2}' "$cg/cpu.stat" 2>/dev/null)
    ts=$(date +%s)
    printf '{"ts":%s,"memCurrent":%s,"inactiveFile":%s,"cpuUsec":%s,"workingSet":%s}\n' \
      "$ts" "$cur" "${inact:-0}" "${cpu:-0}" "$(( cur - ${inact:-0} ))" >> "$out"
    sleep "$SAMPLE_SEC"
  done
}

inpod() { kubectl exec -n "$NS" "$POD" -- bash -lc "$1"; }

push_bins() {
  # Pod KHONG co internet (deny-all + chi mirror docker.io). Binary phai duoc
  # day vao tu host — day chinh la ly do 7.A phai nuong chung vao image.
  # `kubectl` BAT BUOC (image cu chua co no). `kind` chi can cho variant kind —
  # va no CO Y khong nam trong image: 7.B da chon k3s, va giu binary cua duong
  # bi loai trong image cua moi phien keo theo mot CRITICAL (CVE-2025-68121).
  # Muon do lai kind thi tai binary ve $BIN_DIR tren may chu do, khong qua image.
  local b
  for b in kubectl; do
    [ -f "$BIN_DIR/$b" ] || { log "thieu $BIN_DIR/$b"; return 1; }
    kubectl cp -n "$NS" "$BIN_DIR/$b" "$POD:/usr/local/bin/$b" >/dev/null 2>&1
  done
  if [ -f "$BIN_DIR/kind" ]; then
    kubectl cp -n "$NS" "$BIN_DIR/kind" "$POD:/usr/local/bin/kind" >/dev/null 2>&1
    inpod 'chmod +x /usr/local/bin/kind'
  elif [ "$variant" = "kind" ]; then
    log "thieu $BIN_DIR/kind — variant kind can no; tai tu github release roi chay lai"
    return 1
  fi
  inpod 'chmod +x /usr/local/bin/kubectl; kubectl version --client=true 2>&1 | head -1'
  # Noi dung lab cho variant k3s-lab. Day tu host vi pod khong co internet.
  if [ -d "$BIN_DIR/lab" ]; then
    kubectl cp -n "$NS" "$BIN_DIR/lab" "$POD:/lab" >/dev/null 2>&1
    inpod 'chmod +x /lab/*.sh 2>/dev/null; ls /lab | tr "\n" " "'
  fi
}

wait_dockerd() {
  inpod 'for i in $(seq 1 90); do docker info >/dev/null 2>&1 && { echo dockerd-ok; exit 0; }; sleep 1; done; echo dockerd-timeout; exit 1'
}

setup_baseline() { echo "baseline: khong dung gi — day la DOI CHUNG"; }

setup_k3s() {
  # Boot script phai duoc DAY VAO tu host: pod khong co internet, va noi dung
  # cua no (so tan cgroup v2 + registries.yaml cho containerd cua cluster con)
  # dai qua muc chiu duoc cua mot chuoi qua bon lop trich dan
  # ssh -> kubectl exec -> bash -c -> docker run -> sh -c.
  #
  # File duoc scp tu `images/sandbox-base/k3s-boot.sh` — CHINH ban ma image
  # dung, khong phai ban sao. Xem header cua file do.
  kubectl cp -n "$NS" "$BIN_DIR/k3s-boot.sh" "$POD:/k3s-boot.sh" >/dev/null 2>&1
  # ⛔ CO Y KHONG `--network host`.
  #
  # Host-network cho container k3s = cluster con DUNG CHUNG network namespace
  # voi pod sandbox. Hai hau qua, ca hai deu do:
  #   1. iptables/ipvs cua cluster con do thang vao netns cua pod, va service
  #      CIDR cua no chong len cua cum CHU. kube-dns cua cum chu o 10.96.0.10
  #      nam GON trong 10.96.0.0/16 mac dinh cua cluster con — pod mat DNS, mat
  #      luon duong ra mirror, va trieu chung khong tro ve dong nay.
  #   2. Ranh gioi cach ly bi nhoe: netpol ve quanh netns cua pod, nen mot
  #      cluster con dung chung netns lam cho "trong hay ngoai hang rao" khong
  #      con la mot cau hoi co dap an.
  # Bridge rieng + publish 127.0.0.1:6443 giu kubeconfig tro ve 127.0.0.1 (dung
  # nhu k3s ghi ra) ma chi them mot luat DNAT vao netns cua pod.
  inpod "chmod +x /k3s-boot.sh && mkdir -p /k3s-out && docker run -d --name k3s --privileged \
    -p 127.0.0.1:6443:6443 \
    --tmpfs /run --tmpfs /var/run \
    -e DLP_REGISTRY_MIRROR=${MIRROR} \
    -v /k3s-out:/output -v /k3s-boot.sh:/k3s-boot.sh:ro \
    --entrypoint /bin/sh rancher/k3s:${K3S_TAG} /k3s-boot.sh 2>&1 | tail -3"
}

ready_k3s() {
  inpod "mkdir -p ~/.kube; for i in \$(seq 1 ${READY_TIMEOUT}); do
      [ -s /k3s-out/kubeconfig.yaml ] && cp /k3s-out/kubeconfig.yaml ~/.kube/config 2>/dev/null
      kubectl get nodes 2>/dev/null | grep -qw Ready && { echo READY; exit 0; }
      sleep 1; done; echo NOTREADY; exit 1"
}

# ── 2 NODE (P7-bis, 2026-09-04) ──────────────────────────────────────────────
# Do cai gia THAT cua nang luc `multi-node`, thay vi suy ra tu so 1 node.
#
# Ten container, ten mang va vai tro o day TRUNG KHIT voi `start_k8s` cua
# `images/sandbox-base/entrypoint.sh`. Do la co y: mot harness do mot topology
# KHAC voi topology se chay trong san xuat thi con so no tra ve khong noi ve
# thu ta sap ship. Cu the la `dlp-k3s` — dung ten nam trong `--tls-san` ma
# k3s-boot.sh cap cho cert server; doi ten container o day se lam agent bat tay
# TLS voi mot SAN khong khop.
setup_k3s_2node() {
  kubectl cp -n "$NS" "$BIN_DIR/k3s-boot.sh" "$POD:/k3s-boot.sh" >/dev/null 2>&1
  # Bridge mac dinh cua Docker KHONG phan giai ten container, nen agent khong
  # tim duoc `dlp-k3s`. Mang do ta dinh nghia co DNS noi bo.
  inpod "chmod +x /k3s-boot.sh && mkdir -p /k3s-out && docker network create dlp-k3s-net >/dev/null 2>&1; true"
  inpod "docker run -d --name dlp-k3s --privileged --network dlp-k3s-net \
    -p 127.0.0.1:6443:6443 \
    --tmpfs /run --tmpfs /var/run \
    -e DLP_REGISTRY_MIRROR=${MIRROR} -e K3S_TOKEN=${K3S_MEASURE_TOKEN} \
    -v /k3s-out:/output -v /k3s-boot.sh:/k3s-boot.sh:ro \
    --entrypoint /bin/sh rancher/k3s:${K3S_TAG} /k3s-boot.sh server 2>&1 | tail -3"
  inpod "docker run -d --name dlp-k3s-agent2 --privileged --network dlp-k3s-net \
    --tmpfs /run --tmpfs /var/run \
    -e DLP_REGISTRY_MIRROR=${MIRROR} -e K3S_TOKEN=${K3S_MEASURE_TOKEN} \
    -e K3S_URL=https://dlp-k3s:6443 \
    -v /k3s-boot.sh:/k3s-boot.sh:ro \
    --entrypoint /bin/sh rancher/k3s:${K3S_TAG} /k3s-boot.sh agent 2>&1 | tail -3"
}

# Cho DU HAI node, khong phai node dau tien.
#
# `grep -qw Ready` cua bien the 1 node dung ngay khi server Ready — tren cum 2
# node no se bao READY truoc khi agent dang ky xong, va con so "giay toi Ready"
# se la con so cua mot cum 1 node deo nhan 2 node.
ready_k3s_2node() {
  inpod "mkdir -p ~/.kube; for i in \$(seq 1 ${READY_TIMEOUT}); do
      [ -s /k3s-out/kubeconfig.yaml ] && cp /k3s-out/kubeconfig.yaml ~/.kube/config 2>/dev/null
      n=\$(kubectl get nodes --no-headers 2>/dev/null | awk '\$2 == \"Ready\"' | wc -l)
      [ \"\$n\" -ge 2 ] && { echo READY-2NODE; exit 0; }
      sleep 1; done; echo \"NOTREADY(\$n/2)\"; exit 1"
}

# ── TAI THAT (P7-bis, 2026-09-04) ───────────────────────────────────────────
# Dinh 589 MiB cua 7.B do duoc voi DUNG MOT Deployment nginx. Cau hoi con treo:
# mot lab that ton bao nhieu. Tai o day la `dlp-k8s-broken-deploy` — 5
# Deployment + Service + ConfigMap, lab K8s nang nhat trong giao trinh.
#
# Do tren DUONG SAN XUAT (DLP_K8S=1, entrypoint tu dung cluster), khong phai
# duong `docker run` tay cua cac variant khac: con so nay se di thang vao
# `sandbox.profiles`, nen no phai den tu dung cai duong ma nguoi hoc di.
# Tien de cua moi variant k3s: image CO phan k8s. Kiem TRUOC khi bam gio.
assert_k8s_capable() {
  if ! inpod 'test -x /usr/local/bin/dlp-k8s-wait && echo has-k8s' | grep -q has-k8s; then
    log "IMAGE=$IMAGE KHONG co dlp-k8s-wait — image nay co truoc P7."
    log "Lay tag dung: helm get values platform -o yaml | grep sandboxImage"
    exit 3
  fi
}

setup_k3s_lab() {
  assert_k8s_capable
  inpod "dlp-k8s-wait 420 2>&1 | tail -2"
  date +%s > "$T_READY_FILE"
  inpod "bash /lab/background.sh 2>&1 | tail -4"
  inpod "bash /lab/solve.sh 2>&1 | tail -6"
}

ready_k3s_lab() {
  inpod "for i in \$(seq 1 ${READY_TIMEOUT}); do
      t=\$(kubectl get deploy --no-headers 2>/dev/null | wc -l)
      n=\$(kubectl get deploy --no-headers 2>/dev/null | awk '\$2 == \"1/1\"' | wc -l)
      [ \"\$t\" -ge 5 ] && [ \"\$n\" -ge 5 ] && { echo READY-5DEPLOY; exit 0; }
      sleep 3; done; echo \"NOTREADY(\$n/\$t deploy san sang)\"; exit 1"
}

# ── BAI NANG: PVC + image vai tram MB ────────────────────────────────────────
#
# Mon no P7-bis §7: "Lab nang nhat da do la 5 Deployment nginx. Mot bai dung PVC
# hoac image vai tram MB van chua co so."
#
# Hai truc do CUNG MOT LUOT, vi mot bai that thuong co ca hai:
#   · PVC   -> local-path-provisioner cua k3s phai cap volume that tren dia pod
#   · image -> postgres:16 (~450 MB) keo QUA MIRROR, gap ~2.5x nginx:1.29.0
#
# Chay CHONG LEN tai 5-Deployment cua `k3s-lab`, khong thay the no: cau hoi la
# "dinh cua mot bai NANG la bao nhieu", khong phai "dinh cua postgres mot minh".
setup_k3s_heavy_lab() {
  assert_k8s_capable
  inpod "dlp-k8s-wait 420 2>&1 | tail -2"
  date +%s > "$T_READY_FILE"
  inpod "bash /lab/background.sh 2>&1 | tail -4"
  inpod "bash /lab/solve.sh 2>&1 | tail -6"
  inpod "cat <<'HEAVY_EOF' | kubectl apply -f - 2>&1 | tail -4
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: heavy-data
spec:
  accessModes: [ReadWriteOnce]
  resources:
    requests:
      storage: 1Gi
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: heavy-db
spec:
  replicas: 1
  selector:
    matchLabels: { app: heavy-db }
  template:
    metadata:
      labels: { app: heavy-db }
    spec:
      containers:
        - name: db
          image: postgres:16
          env:
            - name: POSTGRES_PASSWORD
              value: heavy-local-only
            - name: PGDATA
              value: /var/lib/postgresql/data/pgdata
          volumeMounts:
            - name: data
              mountPath: /var/lib/postgresql/data
      volumes:
        - name: data
          persistentVolumeClaim:
            claimName: heavy-data
HEAVY_EOF"
}

ready_k3s_heavy_lab() {
  # Ba dieu kien, khong phai mot. Chi doi 5 deploy nginx thi bai nang se bao
  # READY truoc khi postgres keo xong image — va dinh do duoc se la dinh cua
  # bai NHE, dung loai xanh gia ma harness nay da dinh mot lan (do mot pod
  # khong co cluster).
  inpod "for i in \$(seq 1 ${READY_TIMEOUT}); do
      n=\$(kubectl get deploy --no-headers 2>/dev/null | awk '\$2 == \"1/1\"' | wc -l)
      pvc=\$(kubectl get pvc heavy-data -o jsonpath='{.status.phase}' 2>/dev/null)
      [ \"\$n\" -ge 6 ] && [ \"\$pvc\" = Bound ] && { echo READY-HEAVY; exit 0; }
      sleep 3; done
    echo \"NOTREADY(\$n/6 deploy, pvc=\${pvc:-none})\"; exit 1"
}

setup_kind() {
  inpod "kind create cluster --name lab --image ${KIND_NODE_IMAGE} --wait 0s 2>&1 | tail -6"
}

ready_kind() {
  inpod "for i in \$(seq 1 ${READY_TIMEOUT}); do
      kubectl --context kind-lab get nodes 2>/dev/null | grep -qw Ready && { echo READY; exit 0; }
      sleep 2; done; echo NOTREADY; exit 1"
}

main() {
  ensure_ns
  ensure_mirror_access
  make_pod
  local cg
  cg=$(cgroup_dir)
  [ -n "$cg" ] || { log "KHONG tim duoc cgroup cua pod"; exit 1; }
  log "cgroup=$cg"

  local raw="$OUT_DIR/$variant.jsonl" sp
  sampler "$cg" "$raw" &
  sp=$!
  # ⛔ MOT trap EXIT duy nhat, lam CA HAI viec.
  #
  # `trap` KHONG cong don: dat trap thu hai cho cung mot tin hieu se THAY THE
  # cai truoc. Ban dau `drop_mirror_access` duoc dat lam trap ngay sau
  # `ensure_mirror_access`, va dong duoi day lang le xoa no — netpol tam o lai
  # sau khi do xong, tuc mot lo hong ingress vao namespace registry ma khong
  # loi nao bao. Da xay ra that (2026-09-04), phat hien bang `kubectl get
  # netpol -n dlp-registry` chu khong bang bat ky dau hieu nao cua harness.
  #
  # `${sp:-}` chu khong `$sp`: duoi `set -u`, trap chay o duong thoat som (vi
  # du `exit 3` cua assert_k8s_capable) khi `sp` chua duoc gan — va loi
  # "unbound variable" ay se NUOT luon phan don dep dung sau no.
  trap 'kill ${sp:-} 2>/dev/null; drop_mirror_access' EXIT

  wait_dockerd
  push_bins
  sleep 10   # de dockerd + baseline on dinh truoc khi bam gio

  local t0 t1 ready="n/a" setup_log=""
  t0=$(date +%s)
  case "$variant" in
    baseline) setup_log=$(setup_baseline); sleep 60 ;;
    k3s)      setup_log=$(setup_k3s  2>&1); ready=$(ready_k3s  2>&1 | tail -1) ;;
    k3s-2node) setup_log=$(setup_k3s_2node 2>&1); ready=$(ready_k3s_2node 2>&1 | tail -1) ;;
    k3s-lab | k3s-2node-lab)
      setup_log=$(setup_k3s_lab 2>&1); ready=$(ready_k3s_lab 2>&1 | tail -1) ;;
    k3s-heavy-lab)
      setup_log=$(setup_k3s_heavy_lab 2>&1); ready=$(ready_k3s_heavy_lab 2>&1 | tail -1) ;;
    kind)     setup_log=$(setup_kind 2>&1); ready=$(ready_kind 2>&1 | tail -1) ;;
    *) log "variant la: $variant"; exit 2 ;;
  esac
  t1=$(date +%s)

  sleep 20   # bat dinh sau khi Ready (control-plane con on dinh)
  kill $sp 2>/dev/null
  wait $sp 2>/dev/null

  local disk
  disk=$(inpod 'du -sm /var/lib/docker 2>/dev/null | cut -f1' 2>/dev/null | tr -dc '0-9')

  # So lan container k3s phai KHOI DONG LAI (P7-bis mon "cluster con chet ngat
  # quang luc khoi dong", do 2026-09-04).
  #
  # Vi sao phai do RIENG chu khong doc `readyVerdict`: ban va la
  # `--restart=on-failure:3`, va khi no lam dung viec thi cluster VAN Ready —
  # `readyVerdict` xanh o CA hai truong hop, nen no khong phan biet duoc "khong
  # co su co" voi "co su co va da duoc cuu". Con so duy nhat noi ra dieu do la
  # RestartCount cua chinh container.
  #
  # 0  = khong tai phat trong luot nay
  # >0 = da tai phat, va restart policy da cuu duoc phien
  local k3s_restarts
  k3s_restarts=$(inpod 'docker inspect dlp-k3s --format "{{.RestartCount}}" 2>/dev/null' 2>/dev/null | tr -dc '0-9')

  jq -s --arg v "$variant" --arg ready "$ready" --argjson secs "$((t1-t0))" \
        --argjson tready "$(cat "$T_READY_FILE" 2>/dev/null || echo 0)" \
        --arg disk "${disk:-0}" --arg k3srs "${k3s_restarts:-}" --arg log "$setup_log" '
    { variant: $v,
      readyVerdict: $ready,
      secondsToReady: $secs,
      dockerDiskMB: ($disk | tonumber),
      k3sRestartCount: ($k3srs | if . == "" then null else tonumber end),
      samples: length,
      workingSetPeakMiB:  ((map(.workingSet)  | max) / 1048576 * 100 | round / 100),
      workingSetFinalMiB: ((.[-1].workingSet)        / 1048576 * 100 | round / 100),
      # Dinh TINH TOI luc cluster vua Ready = phan cua CLUSTER. Hieu so giua no
      # va dinh tong la phan cua TAI. Khong tach thi mot con so tong khong dat
      # duoc profile: khong biet phan nao co dinh, phan nao theo bai hoc.
      workingSetAtReadyMiB: (if $tready > 0
        then ([.[] | select(.ts <= $tready) | .workingSet] | max // 0) / 1048576 * 100 | round / 100
        else null end),
      memCurrentPeakMiB:  ((map(.memCurrent)  | max) / 1048576 * 100 | round / 100),
      cpuSeconds: (((map(.cpuUsec) | max) - (map(.cpuUsec) | min)) / 1000000 * 100 | round / 100),
      setupLog: $log }' "$raw" | tee "$OUT_DIR/$variant.json"
}

main
