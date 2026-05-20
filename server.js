const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const path = require("path");

app.use(express.static(path.join(__dirname)));

const rooms = {};

io.on("connection", (socket) => {

    console.log("USER CONNECTED:", socket.id);

    socket.on("join", (roomId) => {

        socket.join(roomId);

        if (!rooms[roomId]) {
            rooms[roomId] = socket.id;

            socket.emit("role", "caller");
            console.log("ROLE CALLER:", socket.id);

        } else {

            socket.emit("role", "callee");
            socket.to(roomId).emit("user-joined");

            console.log("ROLE CALLEE:", socket.id);
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

    socket.on("disconnect", () => {

        for (const roomId in rooms) {
            if (rooms[roomId] === socket.id) {
                delete rooms[roomId];
            }
        }

    });

});

server.listen(3000, () => {
    console.log("Server running on 3000");
});