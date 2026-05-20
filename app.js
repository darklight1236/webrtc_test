(() => {

    const localVideo = document.getElementById("local");
    const container = document.querySelector(".container");

    const socket = io();

    const roomId = "test-room";

    let localStream;
    const peers = {}; // socketId → RTCPeerConnection

    socket.emit("join-room", roomId);

    async function start() {

        localStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true
        });

        localVideo.srcObject = localStream;
    }

    socket.on("users", (users) => {

        users.forEach(id => {

            if (id === socket.id) return;
            if (peers[id]) return;

            createPeer(id, true);
        });

    });

    function createPeer(id, initiator) {

        const pc = new RTCPeerConnection({
            iceServers: [
                { urls: "stun:stun.l.google.com:19302" },
                {
                    urls: "turn:82.26.150.172:3478",
                    username: "test",
                    credential: "test123"
                }
            ]
        });

        peers[id] = pc;

        // local tracks
        localStream.getTracks().forEach(track => {
            pc.addTrack(track, localStream);
        });

        // remote video element
        const video = document.createElement("video");
        video.autoplay = true;
        video.playsInline = true;
        video.id = id;
        container.appendChild(video);

        pc.ontrack = (event) => {
            video.srcObject = event.streams[0];
        };

        pc.onicecandidate = (event) => {
            if (event.candidate) {
                socket.emit("candidate", {
                    to: id,
                    candidate: event.candidate
                });
            }
        };

        if (initiator) {
            pc.createOffer().then(offer => {
                pc.setLocalDescription(offer);
                socket.emit("offer", { to: id, offer });
            });
        }

        return pc;
    }

    socket.on("offer", async ({ from, offer }) => {

        const pc = createPeer(from, false);

        await pc.setRemoteDescription(offer);

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        socket.emit("answer", {
            to: from,
            answer
        });
    });

    socket.on("answer", async ({ from, answer }) => {

        await peers[from].setRemoteDescription(answer);
    });

    socket.on("candidate", async ({ from, candidate }) => {

        if (peers[from]) {
            await peers[from].addIceCandidate(candidate);
        }
    });

    start();

})();