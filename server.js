
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const path = require("path");


// app.use(express.static("public"));
app.use(express.static(path.join(__dirname)));

io.on("connection", (socket) => {

    console.log("USER:", socket.id);

    socket.on("join", (roomId) => {

        const room = io.sockets.adapter.rooms.get(roomId);
        const size = room ? room.size : 0;

        socket.join(roomId);

        if (size === 0) {
            socket.emit("role", "caller");
        } else {
            socket.emit("role", "callee");
            socket.to(roomId).emit("user-joined");
        }
    });

    socket.on("offer", ({ offer, roomId }) => {
        socket.to(roomId).emit("offer", offer);
    });

    socket.on("answer", ({ answer, roomId }) => {
        socket.to(roomId).emit("answer", answer);
    });

    socket.on("candidate", ({ candidate, roomId }) => {
        socket.to(roomId).emit("candidate", candidate);
    });

});

server.listen(3000, () => {
    console.log("Server running on 3000");
});