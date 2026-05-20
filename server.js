const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname)));

const users = new Set();

io.on("connection", (socket) => {

    console.log("USER CONNECTED:", socket.id);

    users.add(socket.id);

    socket.emit("users", [...users]);

    socket.broadcast.emit("user-joined", socket.id);

    socket.on("offer", ({ to, offer }) => {

        io.to(to).emit("offer", {
            from: socket.id,
            offer
        });

    });

    socket.on("answer", ({ to, answer }) => {

        io.to(to).emit("answer", {
            from: socket.id,
            answer
        });

    });

    socket.on("candidate", ({ to, candidate }) => {

        io.to(to).emit("candidate", {
            from: socket.id,
            candidate
        });

    });

    socket.on("disconnect", () => {

        console.log("USER LEFT:", socket.id);

        users.delete(socket.id);

        io.emit("user-left", socket.id);
    });

});

server.listen(3000, () => {
    console.log("SERVER RUNNING ON 3000");
});