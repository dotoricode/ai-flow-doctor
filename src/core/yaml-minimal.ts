/**
 * Minimal YAML parser — handles flat keys, nested objects, and simple arrays.
 * No external dependencies. Sufficient for .afd/rules/*.yml diagnostic rule files.
 *
 * Supports:
 *   key: value
 *   key:
 *     nested: value
 *   items:
 *     - value
 *   items:
 *     - op: add
 *       path: /file
 *
 * Does NOT support: anchors, aliases, flow syntax, multi-line strings, tags.
 */

type YamlValue = string | number | boolean | null | YamlObject | YamlValue[];
interface YamlObject {
  [key: string]: YamlValue;
}

export function parse(text: string): YamlObject {
  const lines = text.split("\n");
  return parseBlock(lines, 0, 0).value as YamlObject;
}

interface ParseResult {
  value: YamlValue;
  nextLine: number;
}

function getIndent(line: string): number {
  const match = line.match(/^(\s*)/);
  return match ? match[1].length : 0;
}

function isComment(line: string): boolean {
  return line.trimStart().startsWith("#") || line.trim() === "";
}

function parseScalar(raw: string): YamlValue {
  const trimmed = raw.trim();
  if (trimmed === "" || trimmed === "null" || trimmed === "~") return null;
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  // Remove quotes
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  const num = Number(trimmed);
  if (!isNaN(num) && trimmed !== "") return num;
  return trimmed;
}

function parseBlock(lines: string[], startLine: number, baseIndent: number): ParseResult {
  const obj: YamlObject = {};
  let i = startLine;

  while (i < lines.length) {
    const line = lines[i];

    if (isComment(line)) { i++; continue; }

    const indent = getIndent(line);
    if (indent < baseIndent) break; // dedent → end of block

    const content = line.trim();

    // Array item at this level
    if (content.startsWith("- ")) {
      // This block is actually an array — delegate to array parser
      const arr = parseArray(lines, i, indent);
      return { value: arr.value, nextLine: arr.nextLine };
    }

    // Key-value pair
    const colonIdx = content.indexOf(":");
    if (colonIdx === -1) { i++; continue; }

    const key = content.slice(0, colonIdx).trim();
    const rest = content.slice(colonIdx + 1).trim();

    if (rest === "" || rest === "|" || rest === ">") {
      // Check next line indent to determine nested type
      const nextNonEmpty = findNextNonEmpty(lines, i + 1);
      if (nextNonEmpty < lines.length) {
        const nextIndent = getIndent(lines[nextNonEmpty]);
        if (nextIndent > indent) {
          const nextContent = lines[nextNonEmpty].trim();
          if (nextContent.startsWith("- ")) {
            const arr = parseArray(lines, nextNonEmpty, nextIndent);
            obj[key] = arr.value;
            i = arr.nextLine;
          } else {
            const nested = parseBlock(lines, nextNonEmpty, nextIndent);
            obj[key] = nested.value;
            i = nested.nextLine;
          }
        } else {
          obj[key] = null;
          i++;
        }
      } else {
        obj[key] = null;
        i++;
      }
    } else {
      obj[key] = parseScalar(rest);
      i++;
    }
  }

  return { value: obj, nextLine: i };
}

function parseArray(lines: string[], startLine: number, baseIndent: number): ParseResult {
  const arr: YamlValue[] = [];
  let i = startLine;

  while (i < lines.length) {
    const line = lines[i];
    if (isComment(line)) { i++; continue; }

    const indent = getIndent(line);
    if (indent < baseIndent) break;

    const content = line.trim();
    if (!content.startsWith("- ")) break;

    const itemContent = content.slice(2).trim();

    // Check if this is a simple value or an inline key-value
    const colonIdx = itemContent.indexOf(":");
    if (colonIdx > 0 && !itemContent.startsWith('"') && !itemContent.startsWith("'")) {
      // Inline object start: - key: value
      const itemObj: YamlObject = {};
      const key = itemContent.slice(0, colonIdx).trim();
      const val = itemContent.slice(colonIdx + 1).trim();
      itemObj[key] = parseScalar(val);
      i++;

      // Continuation lines at deeper indent
      const itemIndent = indent + 2;
      while (i < lines.length) {
        const nextLine = lines[i];
        if (isComment(nextLine)) { i++; continue; }
        const nextIndent = getIndent(nextLine);
        if (nextIndent < itemIndent) break;
        const nc = nextLine.trim();
        if (nc.startsWith("- ")) break; // next array item
        const ci = nc.indexOf(":");
        if (ci > 0) {
          itemObj[nc.slice(0, ci).trim()] = parseScalar(nc.slice(ci + 1).trim());
        }
        i++;
      }

      arr.push(itemObj);
    } else {
      // Simple value
      arr.push(parseScalar(itemContent));
      i++;
    }
  }

  return { value: arr, nextLine: i };
}

function findNextNonEmpty(lines: string[], start: number): number {
  for (let i = start; i < lines.length; i++) {
    if (!isComment(lines[i])) return i;
  }
  return lines.length;
}
