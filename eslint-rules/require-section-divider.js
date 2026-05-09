/**
 * require-section-divider
 * ------------------------
 * 约束：大文件必须在顶层用 `=====` 等号注释块做分区。
 *
 * 分区要求（按行数）：
 *   - 150 ~ 349 行：至少 1 个分区块
 *   - 350 ~ 549 行：至少 2 个分区块
 *   - 550 ~ 749 行：至少 3 个分区块
 *   以此类推，每 200 行增加 1 个分区块。
 *
 * 分隔注释块格式（见 .agents/skills/dev-style/SKILL.md）：
 *
 *   // ==============================================================================
 *   // <中文标题>
 *   // ==============================================================================
 *
 * 本规则检查文件中所有 ==== 三行注释块的数量是否达到要求。
 */

const DIVIDER_EQ = /^\s*={4,}\s*$/;

/** 相邻两行注释 + 之间中间一行文字：判定一个三行注释块为分隔块。 */
function isDividerBlock(commentA, commentB, commentC) {
  if (!commentA || !commentB || !commentC) return false;
  if (
    commentA.type !== "Line" ||
    commentB.type !== "Line" ||
    commentC.type !== "Line"
  )
    return false;
  if (!DIVIDER_EQ.test(commentA.value)) return false;
  if (!DIVIDER_EQ.test(commentC.value)) return false;
  if (!commentB.value.trim()) return false;
  if (commentA.loc.end.line + 1 !== commentB.loc.start.line) return false;
  if (commentB.loc.end.line + 1 !== commentC.loc.start.line) return false;
  return true;
}

/** 计算文件需要多少个分区块（每 150 行 1 个，从 150 行起）。 */
function requiredDividers(totalLines, minLines) {
  if (totalLines < minLines) return 0;
  // 150-299: 1个, 300-449: 2个, 依此类推
  return Math.floor(totalLines / minLines);
}

/** @type {import('eslint').Rule.RuleModule} */
const rule = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "大文件（≥ 150 行）必须按行数用适当数量的 `===` 等号注释块分区。",
    },
    schema: [
      {
        type: "object",
        properties: {
          minLines: { type: "number" },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      missing:
        "大文件需要更多 `===` 等号注释块分区。当前需要 {{required}} 个，实际只有 {{actual}} 个。每约 150 行至少应有一个分区块。",
    },
  },
  create(context) {
    const options = context.options[0] || {};
    const minLines = options.minLines ?? 150;
    const sourceCode = context.sourceCode ?? context.getSourceCode();

    return {
      Program(program) {
        const totalLines = program.loc.end.line;
        if (totalLines < minLines) return;

        const required = requiredDividers(totalLines, minLines);
        if (required <= 0) return;

        const allComments = sourceCode.getAllComments();

        let dividerCount = 0;
        for (let i = 0; i + 2 < allComments.length; i += 1) {
          if (
            isDividerBlock(
              allComments[i],
              allComments[i + 1],
              allComments[i + 2],
            )
          ) {
            dividerCount += 1;
            i += 2;
          }
        }

        if (dividerCount < required) {
          context.report({
            loc: {
              start: { line: 1, column: 0 },
              end: { line: 1, column: 0 },
            },
            messageId: "missing",
            data: {
              required: String(required),
              actual: String(dividerCount),
            },
          });
        }
      },
    };
  },
};

export default rule;
