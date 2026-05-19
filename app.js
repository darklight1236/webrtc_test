const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const app = express();

app.use(express.static(__dirname));

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: "*"
    }
});

io.on("connection", socket => {

    console.log("CONNECTED:", socket.id);

    socket.on("offer", offer => {
        socket.broadcast.emit("offer", offer);
    });

    socket.on("answer", answer => {
        socket.broadcast.emit("answer", answer);
    });

    socket.on("candidate", candidate => {
        socket.broadcast.emit("candidate", candidate);
    });

    socket.on("disconnect", () => {
        console.log("DISCONNECTED");
    });

});

server.listen(3000, () => {
    console.log("SERVER STARTED");
});