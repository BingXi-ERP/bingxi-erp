#!/usr/bin/env bash
# ==============================================================================
# frontend/scripts/pairing-fetch-base.sh
#
# 功能：把"分支起点那一枚提交"取到本地仓库，供配对门禁当基线来源。
# 调用方：.github/workflows/e2e-pairing.yml 的两条取基线步骤（PR 传 base 提交号，
#       push 传推送前的 main 提交号）；也可本地手工跑一次看数。
# 入参：$1 起点提交的完整 sha。空串与全零 sha（新建分支的首推）视为没有起点。
# 传给谁：结果只交给调用它的工作流步骤，成功时把 PAIRING_BASE_REF=FETCH_HEAD
#       写进 $GITHUB_ENV，后续判定步据此拼 --baseline-ref；没有 $GITHUB_ENV 时只打印。
# 存什么：不写仓库文件；只在 .git 里留一枚浅取的对象与 FETCH_HEAD 指针。
# 存哪里：仅 Git 对象库，随 runner 一起销毁
#
# 为什么必须由脚本判空值：判定器拿到一个取不到的 ref 会直接判 9（基线读不出来就不许
#   报绿），而"起点本来就是零值 sha"这种情况属于没有可比对象，硬判 9 会让新建分支的
#   首推恒红。故这里把两种情形分开：取到就交 ref，取不到就什么也不写，让工作流把
#   判定步显式跳过并打 notice，跳过不等于通过。
# ==============================================================================
set -euo pipefail

ZERO_SHA="0000000000000000000000000000000000000000"
BASE_SHA="${1:-}"

if [ -z "$BASE_SHA" ] || [ "$BASE_SHA" = "$ZERO_SHA" ]; then
  echo "没有可用的分支起点（收到 '$BASE_SHA'），配对判定本道按跳过处理"
  exit 0
fi

git fetch --no-tags --depth=1 origin "$BASE_SHA"

# 只认那份快照真在起点提交里，FETCH_HEAD 指向别处时不能让判定器拿空集合去比
if ! git cat-file -e "FETCH_HEAD:frontend/scripts/route-snapshot.txt"; then
  echo "::error::起点提交 $BASE_SHA 里没有 frontend/scripts/route-snapshot.txt，基线无从取"
  exit 1
fi

COUNT=$(git show "FETCH_HEAD:frontend/scripts/route-snapshot.txt" | grep -acv '^#' || true)
echo "已取到分支起点基线，端点 ${COUNT} 枚"

if [ -n "${GITHUB_ENV:-}" ]; then
  echo "PAIRING_BASE_REF=FETCH_HEAD" >>"$GITHUB_ENV"
else
  echo "PAIRING_BASE_REF=FETCH_HEAD（本地未设 GITHUB_ENV，仅提示）"
fi
