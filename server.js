const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", // Для теста разрешаем всё. Потом можно заменить на "https://crewlink.ru"
        methods: ["GET", "POST"]
    }
});

app.use(express.static(path.join(__dirname)));

io.on("connection", (socket) => {

    socket.on("join-room", (roomId) => {
        socket.join(roomId);

        // отправляем список всех пользователей в комнате
        const clients = Array.from(io.sockets.adapter.rooms.get(roomId) || []);

        socket.emit("users", clients);

        // уведомляем остальных
        socket.to(roomId).emit("user-joined", socket.id);
    });

    socket.on("offer", ({ to, offer }) => {
        io.to(to).emit("offer", { from: socket.id, offer });
    });

    socket.on("answer", ({ to, answer }) => {
        io.to(to).emit("answer", { from: socket.id, answer });
    });

    socket.on("candidate", ({ to, candidate }) => {
        io.to(to).emit("candidate", { from: socket.id, candidate });
    });

});

server.listen(3000, () => {
    console.log("Server running on 3000");
});