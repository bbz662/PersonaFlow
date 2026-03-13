export type ConnectionState = "connecting" | "connected" | "failed" | "ended";

export type ClientTransportEvent = {
  kind: string;
  text?: string;
};

export type SessionTransportEvent = {
  kind: string;
  speaker: "agent" | "system";
  text: string;
};

type TransportMessage =
  | {
      type: "connection.state";
      state: ConnectionState;
      session_id: string;
    }
  | {
      type: "session.event";
      event: SessionTransportEvent;
    };

type LiveSessionTransportOptions = {
  sessionId: string;
  apiBaseUrl: string;
  onConnectionStateChange: (state: ConnectionState) => void;
  onEvent: (event: SessionTransportEvent) => void;
};

function buildTransportUrl(apiBaseUrl: string, sessionId: string) {
  const baseUrl = new URL(apiBaseUrl);
  const protocol = baseUrl.protocol === "https:" ? "wss:" : "ws:";

  return `${protocol}//${baseUrl.host}/sessions/${sessionId}/live`;
}

export class LiveSessionTransport {
  private readonly options: LiveSessionTransportOptions;
  private socket: WebSocket | null = null;
  private lastState: ConnectionState = "ended";

  constructor(options: LiveSessionTransportOptions) {
    this.options = options;
  }

  connect() {
    this.updateState("connecting");

    const socket = new WebSocket(
      buildTransportUrl(this.options.apiBaseUrl, this.options.sessionId),
    );

    socket.onopen = () => {
      this.socket = socket;
      this.updateState("connected");
    };

    socket.onmessage = (messageEvent) => {
      const payload = JSON.parse(messageEvent.data) as TransportMessage;

      if (payload.type === "connection.state") {
        this.updateState(payload.state);
        return;
      }

      this.options.onEvent(payload.event);
    };

    socket.onerror = () => {
      this.updateState("failed");
    };

    socket.onclose = () => {
      this.socket = null;
      if (this.lastState !== "failed") {
        this.updateState("ended");
      }
    };
  }

  sendEvent(event: ClientTransportEvent) {
    if (!this.socket || this.lastState !== "connected") {
      return;
    }

    this.socket.send(
      JSON.stringify({
        type: "client.event",
        event,
      }),
    );
  }

  disconnect() {
    if (!this.socket) {
      this.updateState("ended");
      return;
    }

    if (this.lastState === "connected") {
      this.socket.send(JSON.stringify({ type: "session.end" }));
      return;
    }

    this.socket.close();
  }

  private updateState(state: ConnectionState) {
    this.lastState = state;
    this.options.onConnectionStateChange(state);
  }
}
