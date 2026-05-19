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

    console.log("CONNECTED:", socket.id);

    socket.on("offer", offer => {
        console.log("OFFER RECEIVED");
        socket.broadcast.emit("offer", offer);
    });

    socket.on("answer", answer => {
        console.log("ANSWER RECEIVED");
        socket.broadcast.emit("answer", answer);
    });

    socket.on("candidate", candidate => {
        console.log("ICE CANDIDATE");
        socket.broadcast.emit("candidate", candidate);
    });

    socket.on("disconnect", () => {
        console.log("DISCONNECTED:", socket.id);
    });

});

server.listen(3000, () => {
    console.log("SERVER STARTED ON PORT 3000");
});