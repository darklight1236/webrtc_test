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

        // отправляем новому список уже существующих
        const clients = Array.from(io.sockets.adapter.rooms.get(roomId) || []);

        socket.emit("users", clients);

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

});

server.listen(3000, () => {
    console.log("Server running on 3000");
});