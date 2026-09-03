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
IMAGE=${IMAGE:-ghcr.io/nghaiz/dlp-sandbox-base:sha-2b79fd3}
MIRROR=${MIRROR:-http://platform-registry-mirror.dlp-registry.svc.cluster.local:5000}
BIN_DIR=${BIN_DIR:-$HOME/p7}
OUT_DIR=${OUT_DIR:-$HOME/p7/out}
K3S_TAG=${K3S_TAG:-v1.34.1-k3s1}
KIND_NODE_IMAGE=${KIND_NODE_IMAGE:-kindest/node:v1.34.0}
# Tran do CO Y rong (6Gi/4cpu): muc dich la tim DINH THAT roi moi dat profile.
# Do duoi tran cua profile la do cai tran, khong phai do nhu cau.
MEM_LIMIT=${MEM_LIMIT:-6Gi}
CPU_LIMIT=${CPU_LIMIT:-4}
SAMPLE_SEC=${SAMPLE_SEC:-2}

variant=${1:?usage: p7-measure.sh <baseline|k3s|kind> [ready-timeout-sec]}
READY_TIMEOUT=${2:-600}
POD="p7-$variant"
mkdir -p "$OUT_DIR"

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
          value: "$MIRROR"
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
  local b
  for b in kubectl kind; do
    [ -f "$BIN_DIR/$b" ] || { log "thieu $BIN_DIR/$b"; return 1; }
    kubectl cp -n "$NS" "$BIN_DIR/$b" "$POD:/usr/local/bin/$b" >/dev/null 2>&1
  done
  inpod 'chmod +x /usr/local/bin/kubectl /usr/local/bin/kind; kubectl version --client=true 2>&1 | head -1'
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
  make_pod
  local cg
  cg=$(cgroup_dir)
  [ -n "$cg" ] || { log "KHONG tim duoc cgroup cua pod"; exit 1; }
  log "cgroup=$cg"

  local raw="$OUT_DIR/$variant.jsonl" sp
  sampler "$cg" "$raw" &
  sp=$!
  trap 'kill $sp 2>/dev/null' EXIT

  wait_dockerd
  push_bins
  sleep 10   # de dockerd + baseline on dinh truoc khi bam gio

  local t0 t1 ready="n/a" setup_log=""
  t0=$(date +%s)
  case "$variant" in
    baseline) setup_log=$(setup_baseline); sleep 60 ;;
    k3s)      setup_log=$(setup_k3s  2>&1); ready=$(ready_k3s  2>&1 | tail -1) ;;
    kind)     setup_log=$(setup_kind 2>&1); ready=$(ready_kind 2>&1 | tail -1) ;;
    *) log "variant la: $variant"; exit 2 ;;
  esac
  t1=$(date +%s)

  sleep 20   # bat dinh sau khi Ready (control-plane con on dinh)
  kill $sp 2>/dev/null
  wait $sp 2>/dev/null

  local disk
  disk=$(inpod 'du -sm /var/lib/docker 2>/dev/null | cut -f1' 2>/dev/null | tr -dc '0-9')

  jq -s --arg v "$variant" --arg ready "$ready" --argjson secs "$((t1-t0))" \
        --arg disk "${disk:-0}" --arg log "$setup_log" '
    { variant: $v,
      readyVerdict: $ready,
      secondsToReady: $secs,
      dockerDiskMB: ($disk | tonumber),
      samples: length,
      workingSetPeakMiB:  ((map(.workingSet)  | max) / 1048576 * 100 | round / 100),
      workingSetFinalMiB: ((.[-1].workingSet)        / 1048576 * 100 | round / 100),
      memCurrentPeakMiB:  ((map(.memCurrent)  | max) / 1048576 * 100 | round / 100),
      cpuSeconds: (((map(.cpuUsec) | max) - (map(.cpuUsec) | min)) / 1000000 * 100 | round / 100),
      setupLog: $log }' "$raw" | tee "$OUT_DIR/$variant.json"
}

main
