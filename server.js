const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();

const server = http.createServer(app);

const io = new Server(server);

app.use(express.static(path.join(__dirname)));

io.on("connection", (socket) => {

    socket.on("join-room", (roomId) => {

        socket.join(roomId);

        const clients =
            Array.from(
                io.sockets.adapter.rooms.get(roomId) || []
            );

        socket.emit("users", clients);

        socket.to(roomId).emit(
            "user-joined",
            socket.id
        );
    });

    // OFFER

    socket.on("offer", ({ to, offer }) => {

        io.to(to).emit("offer", {
            from: socket.id,
            offer
        });

    });

    // ANSWER

    socket.on("answer", ({ to, answer }) => {

        io.to(to).emit("answer", {
            from: socket.id,
            answer
        });

    });

    // ICE

    socket.on("candidate", ({ to, candidate }) => {

        io.to(to).emit("candidate", {
            from: socket.id,
            candidate
        });

    });

    // DISCONNECT

    socket.on("disconnect", () => {

        for (const roomId of socket.rooms) {

            if (roomId !== socket.id) {

                socket.to(roomId).emit(
                    "user-left",
                    socket.id
                );
            }
        }

    });

});

server.listen(3000, () => {

    console.log("Server running on port 3000");

});