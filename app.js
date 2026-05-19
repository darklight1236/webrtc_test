const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const app = express();

app.use(express.static(path.join(__dirname, "../client")));

const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: "*"
    }
});

io.on("connection", socket => {

    console.log("User connected:", socket.id);

    socket.on("offer", offer => {
        socket.broadcast.emit("offer", offer);
    });

    socket.on("answer", answer => {
        socket.broadcast.emit("answer", answer);
    });

    socket.on("candidate", candidate => {
        socket.broadcast.emit("candidate", candidate);
    });

});

server.listen(3000, () => {
    console.log("Server running on port 3000");
});