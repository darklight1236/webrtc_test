(() => {

    const localVideo = document.getElementById("local");
    const container = document.querySelector(".container");

    const socket = io();
    const roomId = "test-room";

    let localStream = null;
    let streamReady = false;

    const peers = {};
    const pendingCandidates = {};

    // ─────────────────────────────
    // FULLSCREEN
    // ─────────────────────────────

    function openFullscreen(el) {

        if (!el) return;

        if (el.requestFullscreen) {
            el.requestFullscreen();
        } 
        else if (el.webkitRequestFullscreen) {
            el.webkitRequestFullscreen();
        } 
        else if (el.msRequestFullscreen) {
            el.msRequestFullscreen();
        }
    }

    // ─────────────────────────────
    // START STREAM
    // ─────────────────────────────

    async function start() {

        localStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true
        });

        streamReady = true;

        localVideo.srcObject = localStream;

        localVideo.onclick = () => {
            openFullscreen(localVideo);
        };

        socket.emit("join-room", roomId);
    }

    // ─────────────────────────────
    // CREATE PEER
    // ─────────────────────────────

    function createPeer(id) {

        const pc = new RTCPeerConnection({
            iceServers: [
                { urls: "stun:stun.l.google.com:19302" }
            ]
        });

        peers[id] = pc;

        localStream.getTracks().forEach(track => {
            pc.addTrack(track, localStream);
        });

        // UI
        const client = document.createElement("div");
        client.className = "client";
        client.id = `client-${id}`;

        const video = document.createElement("video");

        video.autoplay = true;
        video.playsInline = true;

        // FULLSCREEN ON CLICK
        video.onclick = () => {
            openFullscreen(video);
        };

        const username = document.createElement("div");
        username.className = "username";
        username.innerText = "User";

        client.appendChild(video);
        client.appendChild(username);
        container.appendChild(client);

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

        pc.onconnectionstatechange = () => {

            if (
                pc.connectionState === "failed" ||
                pc.connectionState === "disconnected" ||
                pc.connectionState === "closed"
            ) {
                cleanupPeer(id);
            }
        };

        return pc;
    }

    // ─────────────────────────────
    // CLEANUP
    // ─────────────────────────────

    function cleanupPeer(id) {

        if (peers[id]) {
            peers[id].close();
            delete peers[id];
        }

        const client = document.getElementById(`client-${id}`);

        if (client) {
            client.remove();
        }

        console.log("CLEANED:", id);
    }

    // ─────────────────────────────
    // USERS LIST
    // ─────────────────────────────

    socket.on("users", (users) => {

        if (!streamReady) return;

        users.forEach(id => {

            if (id === socket.id) return;
            if (peers[id]) return;

            const pc = createPeer(id);

            pc.createOffer()
                .then(o => pc.setLocalDescription(o))
                .then(() => {
                    socket.emit("offer", {
                        to: id,
                        offer: pc.localDescription
                    });
                });

        });
    });

    // ─────────────────────────────
    // OFFER
    // ─────────────────────────────

    socket.on("offer", async ({ from, offer }) => {

        if (!peers[from]) {
            createPeer(from);
        }

        const pc = peers[from];

        await pc.setRemoteDescription(new RTCSessionDescription(offer));

        flushCandidates(from);

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        socket.emit("answer", {
            to: from,
            answer
        });
    });

    // ─────────────────────────────
    // ANSWER
    // ─────────────────────────────

    socket.on("answer", async ({ from, answer }) => {

        const pc = peers[from];

        if (!pc) return;

        await pc.setRemoteDescription(new RTCSessionDescription(answer));

        flushCandidates(from);
    });

    // ─────────────────────────────
    // ICE
    // ─────────────────────────────

    socket.on("candidate", async ({ from, candidate }) => {

        const pc = peers[from];

        if (!pc) return;

        if (!pc.remoteDescription) {

            if (!pendingCandidates[from]) {
                pendingCandidates[from] = [];
            }

            pendingCandidates[from].push(candidate);
            return;
        }

        await pc.addIceCandidate(new RTCIceCandidate(candidate));
    });

    function flushCandidates(id) {

        const pc = peers[id];
        if (!pc) return;

        if (pendingCandidates[id]) {
            for (const c of pendingCandidates[id]) {
                pc.addIceCandidate(new RTCIceCandidate(c));
            }
            pendingCandidates[id] = [];
        }
    }

    // ─────────────────────────────
    // USER LEFT
    // ─────────────────────────────

    socket.on("user-left", (id) => {
        cleanupPeer(id);
    });

    start();

})();