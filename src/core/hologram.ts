import ts from "typescript";

export interface HologramResult {
  hologram: string;
  originalLength: number;
  hologramLength: number;
  savings: number; // percentage 0-100
}

export function generateHologram(filePath: string, source: string): HologramResult {
  const sf = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true);
  const lines: string[] = [];

  for (const stmt of sf.statements) {
    const line = extractNode(stmt, source);
    if (line) lines.push(line);
  }

  const hologram = lines.join("\n");
  const originalLength = source.length;
  const hologramLength = hologram.length;
  const savings = originalLength > 0
    ? Math.round((originalLength - hologramLength) / originalLength * 1000) / 10
    : 0;

  return { hologram, originalLength, hologramLength, savings };
}

function extractNode(node: ts.Node, source: string): string | null {
  // Import declarations — keep as-is
  if (ts.isImportDeclaration(node)) {
    return node.getText().replace(/\s+/g, " ").trim();
  }

  // Export declarations (re-exports)
  if (ts.isExportDeclaration(node)) {
    return node.getText().replace(/\s+/g, " ").trim();
  }

  // Export assignment (export default ...)
  if (ts.isExportAssignment(node)) {
    return `export default ${getTypeName(node.expression)};`;
  }

  // Type alias
  if (ts.isTypeAliasDeclaration(node)) {
    return collapseWhitespace(node.getText());
  }

  // Interface
  if (ts.isInterfaceDeclaration(node)) {
    return extractInterface(node);
  }

  // Enum
  if (ts.isEnumDeclaration(node)) {
    return extractEnum(node);
  }

  // Class
  if (ts.isClassDeclaration(node)) {
    return extractClass(node);
  }

  // Function declaration
  if (ts.isFunctionDeclaration(node)) {
    return extractFunction(node);
  }

  // Variable statement (const/let/var — may contain arrow functions, objects, etc.)
  if (ts.isVariableStatement(node)) {
    return extractVariableStatement(node);
  }

  // Fallback: skip unknown top-level statements
  return null;
}

function extractInterface(node: ts.InterfaceDeclaration): string {
  const mods = getModifiers(node);
  const name = node.name.text;
  const ext = node.heritageClauses
    ? " " + node.heritageClauses.map(h => h.getText()).join(", ")
    : "";
  const members = node.members.map(m => {
    const text = collapseWhitespace(m.getText()).replace(/;$/, "");
    return "  " + text + ";";
  }).join("\n");
  return `${mods}interface ${name}${ext} {\n${members}\n}`;
}

function extractEnum(node: ts.EnumDeclaration): string {
  const mods = getModifiers(node);
  const name = node.name.text;
  const members = node.members.map(m => collapseWhitespace(m.getText())).join(", ");
  return `${mods}enum ${name} { ${members} }`;
}

function extractClass(node: ts.ClassDeclaration): string {
  const mods = getModifiers(node);
  const name = node.name?.text ?? "Anonymous";
  const ext = node.heritageClauses
    ? " " + node.heritageClauses.map(h => h.getText()).join(", ")
    : "";

  const members: string[] = [];
  for (const member of node.members) {
    if (ts.isPropertyDeclaration(member)) {
      members.push("  " + extractProperty(member) + ";");
    } else if (ts.isMethodDeclaration(member) || ts.isGetAccessor(member) || ts.isSetAccessor(member)) {
      members.push("  " + extractMethodSignature(member) + ";");
    } else if (ts.isConstructorDeclaration(member)) {
      const params = extractParams(member.parameters);
      members.push(`  constructor(${params});`);
    }
  }

  return `${mods}class ${name}${ext} {\n${members.join("\n")}\n}`;
}

function extractFunction(node: ts.FunctionDeclaration): string {
  const mods = getModifiers(node);
  const name = node.name?.text ?? "anonymous";
  const typeParams = node.typeParameters
    ? `<${node.typeParameters.map(t => t.getText()).join(", ")}>`
    : "";
  const params = extractParams(node.parameters);
  const ret = node.type ? ": " + collapseWhitespace(node.type.getText()) : "";
  const async = hasModifier(node, ts.SyntaxKind.AsyncKeyword) ? "async " : "";
  return `${mods}${async}function ${name}${typeParams}(${params})${ret} {…}`;
}

function extractVariableStatement(node: ts.VariableStatement): string {
  const mods = getModifiers(node);
  const keyword = node.declarationList.flags & ts.NodeFlags.Const ? "const"
    : node.declarationList.flags & ts.NodeFlags.Let ? "let" : "var";

  const decls = node.declarationList.declarations.map(d => {
    const name = d.name.getText();
    const typeAnn = d.type ? ": " + collapseWhitespace(d.type.getText()) : "";

    if (d.initializer) {
      // Arrow function or function expression
      if (ts.isArrowFunction(d.initializer) || ts.isFunctionExpression(d.initializer)) {
        const fn = d.initializer;
        const async = hasModifier(fn, ts.SyntaxKind.AsyncKeyword) ? "async " : "";
        const typeParams = fn.typeParameters
          ? `<${fn.typeParameters.map(t => t.getText()).join(", ")}>`
          : "";
        const params = extractParams(fn.parameters);
        const ret = fn.type ? ": " + collapseWhitespace(fn.type.getText()) : "";
        return `${name} = ${async}${typeParams}(${params})${ret} => {…}`;
      }
      // Object/array/other — just show type or truncated value
      if (typeAnn) return `${name}${typeAnn}`;
      return `${name} = …`;
    }

    return `${name}${typeAnn}`;
  });

  return `${mods}${keyword} ${decls.join(", ")};`;
}

function extractProperty(node: ts.PropertyDeclaration): string {
  const mods = getMemberModifiers(node);
  const name = node.name.getText();
  const type = node.type ? ": " + collapseWhitespace(node.type.getText()) : "";
  const optional = node.questionToken ? "?" : "";
  return `${mods}${name}${optional}${type}`;
}

function extractMethodSignature(node: ts.MethodDeclaration | ts.GetAccessorDeclaration | ts.SetAccessorDeclaration): string {
  const mods = getMemberModifiers(node);
  const name = node.name.getText();
  const async = hasModifier(node, ts.SyntaxKind.AsyncKeyword) ? "async " : "";

  if (ts.isGetAccessor(node)) {
    const ret = node.type ? ": " + collapseWhitespace(node.type.getText()) : "";
    return `${mods}get ${name}()${ret}`;
  }
  if (ts.isSetAccessor(node)) {
    const params = extractParams(node.parameters);
    return `${mods}set ${name}(${params})`;
  }

  const md = node as ts.MethodDeclaration;
  const typeParams = md.typeParameters
    ? `<${md.typeParameters.map(t => t.getText()).join(", ")}>`
    : "";
  const params = extractParams(md.parameters);
  const ret = md.type ? ": " + collapseWhitespace(md.type.getText()) : "";
  return `${mods}${async}${name}${typeParams}(${params})${ret}`;
}

function extractParams(params: ts.NodeArray<ts.ParameterDeclaration>): string {
  return params.map(p => {
    const name = p.name.getText();
    const optional = p.questionToken ? "?" : "";
    const type = p.type ? ": " + collapseWhitespace(p.type.getText()) : "";
    const rest = p.dotDotDotToken ? "..." : "";
    return `${rest}${name}${optional}${type}`;
  }).join(", ");
}

function getModifiers(node: ts.Node): string {
  const mods = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
  if (!mods) return "";
  const relevant = mods
    .filter(m => m.kind === ts.SyntaxKind.ExportKeyword || m.kind === ts.SyntaxKind.DefaultKeyword || m.kind === ts.SyntaxKind.DeclareKeyword)
    .map(m => m.getText());
  return relevant.length ? relevant.join(" ") + " " : "";
}

function getMemberModifiers(node: ts.Node): string {
  const mods = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
  if (!mods) return "";
  const relevant = mods
    .filter(m =>
      m.kind === ts.SyntaxKind.PublicKeyword ||
      m.kind === ts.SyntaxKind.PrivateKeyword ||
      m.kind === ts.SyntaxKind.ProtectedKeyword ||
      m.kind === ts.SyntaxKind.StaticKeyword ||
      m.kind === ts.SyntaxKind.ReadonlyKeyword ||
      m.kind === ts.SyntaxKind.AbstractKeyword
    )
    .map(m => m.getText());
  return relevant.length ? relevant.join(" ") + " " : "";
}

function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
  const mods = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
  return mods?.some(m => m.kind === kind) ?? false;
}

function getTypeName(node: ts.Node): string {
  if (ts.isIdentifier(node)) return node.text;
  return "…";
}

function collapseWhitespace(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}
