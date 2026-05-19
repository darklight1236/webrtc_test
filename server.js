const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const app = express();

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

app.use(express.static(__dirname));

const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: "*"
    }
});

io.on("connection", socket => {

    socket.on("join", roomId => {
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
    console.log("SERVER STARTED ON PORT 3000");
});