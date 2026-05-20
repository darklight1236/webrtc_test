const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

io.on("connection", (socket) => {

    console.log("USER CONNECTED:", socket.id);

    socket.on("join", (roomId) => {
        socket.join(roomId);
        socket.to(roomId).emit("user-joined");
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
    console.log("Server running on port 3000");
});