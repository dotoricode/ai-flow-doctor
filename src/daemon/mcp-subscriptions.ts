/**
 * MCP Subscription Manager — v1.9.0 MCP Phase 3
 *
 * MCP 2024-11-05 스펙의 `resources/subscribe` 프로토콜 구현.
 * 구독된 URI에 대해 `notifications/resources/updated`를 push-based로 전송한다.
 */

/** 구독 중인 URI 집합 관리 + 알림 발송 */
export class SubscriptionManager {
  private subscriptions = new Set<string>();
  private active = false;

  /** MCP stdio 모드 활성화 (서버 시작 시 호출) */
  enable(): void {
    this.active = true;
  }

  subscribe(uri: string): void {
    this.subscriptions.add(uri);
  }

  unsubscribe(uri: string): void {
    this.subscriptions.delete(uri);
  }

  isSubscribed(uri: string): boolean {
    return this.subscriptions.has(uri);
  }

  /**
   * 구독된 URI에 notifications/resources/updated 발송.
   * MCP 모드가 아니거나 구독자가 없으면 no-op.
   */
  dispatchResourceUpdated(uri: string): void {
    if (!this.active || !this.subscriptions.has(uri)) return;
    try {
      process.stdout.write(
        JSON.stringify({
          jsonrpc: "2.0",
          method: "notifications/resources/updated",
          params: { uri },
        }) + "\n"
      );
    } catch { /* crash-only */ }
  }

  /**
   * notifications/resources/list_changed 발송.
   * 새로운 동적 리소스가 생성될 때 호출.
   */
  dispatchListChanged(): void {
    if (!this.active) return;
    try {
      process.stdout.write(
        JSON.stringify({
          jsonrpc: "2.0",
          method: "notifications/resources/list_changed",
        }) + "\n"
      );
    } catch { /* crash-only */ }
  }

  /**
   * notifications/message 발송 (레벨: "debug" | "info" | "warning" | "error").
   */
  dispatchMessage(level: "debug" | "info" | "warning" | "error", data: string): void {
    if (!this.active) return;
    try {
      process.stdout.write(
        JSON.stringify({
          jsonrpc: "2.0",
          method: "notifications/message",
          params: { level, data },
        }) + "\n"
      );
    } catch { /* crash-only */ }
  }
}

/** 모듈 수준 싱글톤 — server.ts와 mcp-handler.ts가 공유 */
export const subscriptionManager = new SubscriptionManager();
