const DEFAULT_MAX = 500;

function normalizeOptions(options = {}) {
  if (typeof options === "number") {
    return {
      max: options,
      skipBlankLines: true,
      skipComments: true,
    };
  }
  return {
    max: options.max ?? DEFAULT_MAX,
    skipBlankLines: options.skipBlankLines ?? true,
    skipComments: options.skipComments ?? true,
  };
}

function getCommentLines(sourceCode) {
  const lines = new Set();
  for (const comment of sourceCode.getAllComments()) {
    const start = comment.loc.start.line;
    const end = comment.loc.end.line;
    for (let line = start; line <= end; line++) {
      lines.add(line);
    }
  }
  return lines;
}

/** @type {import('eslint').Rule.RuleModule} */
const rule = {
  meta: {
    type: "layout",
    docs: {
      description: "限制单文件代码行数，超过时提示拆分子文件。",
    },
    schema: [
      {
        oneOf: [
          {
            type: "integer",
            minimum: 0,
          },
          {
            type: "object",
            additionalProperties: false,
            properties: {
              max: {
                type: "integer",
                minimum: 0,
              },
              skipBlankLines: {
                type: "boolean",
              },
              skipComments: {
                type: "boolean",
              },
            },
          },
        ],
      },
    ],
    messages: {
      tooManyLines:
        "单文件代码行数过多（{{ lineCount }} 行，最多 {{ max }} 行），请拆分为子文件。",
    },
  },
  create(context) {
    const options = normalizeOptions(context.options[0]);

    return {
      "Program:exit"(node) {
        const sourceCode = context.getSourceCode();
        const commentLines = options.skipComments
          ? getCommentLines(sourceCode)
          : new Set();
        let lineCount = 0;
        let reportLine = sourceCode.lines.length || 1;

        for (let index = 0; index < sourceCode.lines.length; index++) {
          const lineNumber = index + 1;
          const line = sourceCode.lines[index];
          if (options.skipBlankLines && line.trim() === "") {
            continue;
          }
          if (options.skipComments && commentLines.has(lineNumber)) {
            continue;
          }

          lineCount++;
          if (lineCount === options.max + 1) {
            reportLine = lineNumber;
          }
        }

        if (lineCount <= options.max) {
          return;
        }

        context.report({
          node,
          loc: {
            line: reportLine,
            column: 0,
          },
          messageId: "tooManyLines",
          data: {
            lineCount,
            max: options.max,
          },
        });
      },
    };
  },
};

export default rule;
