const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname)));

const users = {};

io.on("connection", (socket) => {

    socket.on("join-room", (roomId) => {

        if (!users[roomId]) users[roomId] = [];

        users[roomId].push(socket.id);

        socket.join(roomId);

        // отправляем список всех пользователей в комнате
        io.to(roomId).emit("users", users[roomId]);
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

    socket.on("disconnect", () => {
        for (const roomId in users) {
            users[roomId] = users[roomId].filter(id => id !== socket.id);
        }
    });

});

server.listen(3000, () => {
    console.log("Server running");
});