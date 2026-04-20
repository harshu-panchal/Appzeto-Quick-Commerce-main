import { io } from "socket.io-client";
import { resolveSocketBaseUrl } from "@core/api/resolveApiBaseUrl";

const SOCKET_URL = resolveSocketBaseUrl();

class SocketService {
    socket = null;

    connect() {
        if (this.socket) return this.socket;

        this.socket = io(SOCKET_URL, {
            transports: ["websocket"],
            reconnection: true,
        });

        this.socket.on("connect", () => {
            console.log("[Socket] Connected to server");
        });

        this.socket.on("disconnect", () => {
            console.log("[Socket] Disconnected from server");
        });

        return this.socket;
    }

    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }
    }

    emit(event, data) {
        if (this.socket) {
            this.socket.emit(event, data);
        }
    }

    on(event, callback) {
        if (this.socket) {
            this.socket.on(event, callback);
        }
    }

    off(event, callback) {
        if (this.socket) {
            this.socket.off(event, callback);
        }
    }
}

export const socketService = new SocketService();
