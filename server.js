const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname)));

io.on("connection", (socket) => {

    socket.on("join-room", ({ roomId, name }) => {

        socket.join(roomId);

        socket.data.name = name;

        const clients = Array.from(io.sockets.adapter.rooms.get(roomId) || []);

        // отправляем новому ВСЕХ пользователей с именами
        const users = clients.map(id => ({
            id,
            name: io.sockets.sockets.get(id)?.data?.name || "User"
        }));

        socket.emit("users", users);

        // сообщаем другим о новом пользователе
        socket.to(roomId).emit("user-joined", {
            id: socket.id,
            name: socket.data.name
        });
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
        for (const roomId of socket.rooms) {
            if (roomId !== socket.id) {
                socket.to(roomId).emit("user-left", socket.id);
            }
        }
    });

    socket.on("camera-state", ({ roomId, userId, isOff }) => {
        socket.to(roomId).emit("camera-state", {
            userId,
            isOff
        });
    });

});

server.listen(3000, () => {
    console.log("Server running on 3000");
});