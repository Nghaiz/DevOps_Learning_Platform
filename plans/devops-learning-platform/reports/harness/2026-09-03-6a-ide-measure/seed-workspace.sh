set -e
mkdir -p /root/workspace/src
cd /root/workspace
i=1
while [ $i -le 50 ]; do
  printf 'export const v%s = %s;\n' "$i" "$i" > src/mod$i.ts
  head -c 600 /dev/urandom | base64 -w0 | sed 's|^|// |' >> src/mod$i.ts
  printf '\n' >> src/mod$i.ts
  i=$((i + 1))
done
printf '{"name":"probe"}\n' > package.json
git init -q 2>/dev/null || true
ls src | wc -l
du -sh /root/workspace | cut -f1
