/**
 * MCP Protocol Integration Test
 *
 * Spawns the daemon in MCP mode via child_process and sends JSON-RPC
 * messages via stdin, validating responses on stdout.
 */
import { describe, test, expect } from "bun:test";
import { spawn } from "child_process";
import { resolve } from "path";

function createMcpProcess() {
  const serverPath = resolve("src/daemon/server.ts");
  const proc = spawn("bun", ["run", serverPath], {
    stdio: ["pipe", "pipe", "ignore"],
    env: { ...process.env, AFD_MCP: "1" },
  });
  return proc;
}

function sendAndReceive(
  proc: ReturnType<typeof spawn>,
  request: Record<string, unknown>,
  timeoutMs = 5000,
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("MCP response timeout")), timeoutMs);

    let buffer = "";
    const onData = (chunk: Buffer) => {
      buffer += chunk.toString();
      const nlIdx = buffer.indexOf("\n");
      if (nlIdx !== -1) {
        proc.stdout!.off("data", onData);
        clearTimeout(timer);
        try {
          resolve(JSON.parse(buffer.slice(0, nlIdx)));
        } catch (e) {
          reject(new Error(`Invalid JSON: ${buffer.slice(0, nlIdx)}`));
        }
        buffer = buffer.slice(nlIdx + 1);
      }
    };
    proc.stdout!.on("data", onData);

    proc.stdin!.write(JSON.stringify(request) + "\n");
  });
}

describe("MCP stdio protocol", () => {
  test("initialize → tools/list → tools/call", async () => {
    const proc = createMcpProcess();

    try {
      // Wait for process to boot
      await new Promise(r => setTimeout(r, 1500));

      // 1. initialize
      const initRes = await sendAndReceive(proc, {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "test" } },
      });
      expect(initRes.id).toBe(1);
      const initResult = initRes.result as Record<string, unknown>;
      expect(initResult.protocolVersion).toBe("2024-11-05");
      expect((initResult.serverInfo as { name: string }).name).toBe("afd");

      // 2. tools/list
      const listRes = await sendAndReceive(proc, {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/list",
      });
      expect(listRes.id).toBe(2);
      const tools = (listRes.result as { tools: { name: string }[] }).tools;
      const toolNames = tools.map(t => t.name);
      expect(toolNames).toContain("afd_diagnose");
      expect(toolNames).toContain("afd_score");
      expect(toolNames).toContain("afd_hologram");
      expect(toolNames).toContain("afd_read");
      expect(tools.length).toBeGreaterThanOrEqual(4);

      // 3. tools/call afd_diagnose
      const diagnoseRes = await sendAndReceive(proc, {
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name: "afd_diagnose", arguments: { raw: true } },
      });
      expect(diagnoseRes.id).toBe(3);
      expect(diagnoseRes.error).toBeUndefined();
      const diagContent = (diagnoseRes.result as { content: { type: string; text: string }[] }).content;
      expect(diagContent[0].type).toBe("text");
      const diagParsed = JSON.parse(diagContent[0].text);
      expect(Array.isArray(diagParsed.symptoms)).toBe(true);
      expect(Array.isArray(diagParsed.healthy)).toBe(true);

      // 4. tools/call afd_score
      const scoreRes = await sendAndReceive(proc, {
        jsonrpc: "2.0",
        id: 4,
        method: "tools/call",
        params: { name: "afd_score", arguments: {} },
      });
      expect(scoreRes.id).toBe(4);
      const scoreContent = (scoreRes.result as { content: { text: string }[] }).content;
      const score = JSON.parse(scoreContent[0].text);
      expect(typeof score.uptime).toBe("number");
      expect(typeof score.autoHealed).toBe("number");
      expect(score).toHaveProperty("hologramSavings");

      // 5. tools/call unknown → error
      const unknownRes = await sendAndReceive(proc, {
        jsonrpc: "2.0",
        id: 5,
        method: "tools/call",
        params: { name: "nonexistent_tool", arguments: {} },
      });
      expect(unknownRes.id).toBe(5);
      expect(unknownRes.error).toBeDefined();
      expect((unknownRes.error as { code: number }).code).toBe(-32601);

      // 6. tools/call afd_hologram with missing arg → error
      const holoErrRes = await sendAndReceive(proc, {
        jsonrpc: "2.0",
        id: 6,
        method: "tools/call",
        params: { name: "afd_hologram", arguments: {} },
      });
      expect(holoErrRes.id).toBe(6);
      expect(holoErrRes.error).toBeDefined();

      // 7. unknown method → error
      const badMethodRes = await sendAndReceive(proc, {
        jsonrpc: "2.0",
        id: 7,
        method: "totally/unknown",
      });
      expect(badMethodRes.id).toBe(7);
      expect(badMethodRes.error).toBeDefined();
    } finally {
      proc.kill();
    }
  }, 20000);
});
