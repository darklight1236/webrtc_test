(() => {

    const socket = io();
    const container = document.querySelector(".container");
    const localVideo = document.getElementById("local");

    const peers = {};
    let localStream = null;
    let isReady = false;

    // ─────────────────────────────
    // START
    // ─────────────────────────────

    async function start() {

        try {

            localStream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: true
            });

            localVideo.srcObject = localStream;

            isReady = true;

            socket.emit("join-room", "main");

        } catch (e) {

            console.error("CAMERA ERROR:", e);
        }
    }

    // ─────────────────────────────
    // CREATE PEER
    // ─────────────────────────────

    function createPeer(id) {

        if (!isReady) {
            console.warn("WAITING FOR MEDIA");
            return null;
        }

        if (peers[id]) return peers[id];

        const pc = new RTCPeerConnection({
            iceServers: [
                { urls: "stun:stun.l.google.com:19302" }
            ]
        });

        peers[id] = pc;

        // 🔥 ВАЖНО: теперь localStream гарантирован
        localStream.getTracks().forEach(track => {
            pc.addTrack(track, localStream);
        });

        pc.ontrack = (event) => {

            let video = document.getElementById(`video-${id}`);

            if (!video) {

                const wrapper = document.createElement("div");
                wrapper.className = "client";
                wrapper.id = `client-${id}`;

                video = document.createElement("video");
                video.id = `video-${id}`;
                video.autoplay = true;
                video.playsInline = true;

                wrapper.appendChild(video);
                container.appendChild(wrapper);
            }

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
                pc.connectionState === "closed"
            ) {
                removePeer(id);
            }
        };

        return pc;
    }

    // ─────────────────────────────
    // REMOVE PEER
    // ─────────────────────────────

    function removePeer(id) {

        if (peers[id]) {
            peers[id].close();
            delete peers[id];
        }

        const el = document.getElementById(`client-${id}`);
        if (el) el.remove();
    }

    // ─────────────────────────────
    // USERS
    // ─────────────────────────────

    socket.on("users", async (users) => {

        if (!isReady) {
            setTimeout(() => socket.emit("join-room"), 500);
            return;
        }

        const selfId = socket.id;

        users.forEach(id => {
            if (id !== selfId) {
                createPeer(id);
            }
        });

        const initiator = users[0] === selfId;

        if (!initiator) return;

        setTimeout(async () => {

            for (const id of users) {

                if (id === selfId) continue;

                const pc = peers[id];
                if (!pc) continue;

                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);

                socket.emit("offer", {
                    to: id,
                    offer
                });
            }

        }, 1000);
    });

    // ─────────────────────────────
    // OFFER
    // ─────────────────────────────

    socket.on("offer", async ({ from, offer }) => {

        const pc = createPeer(from);
        if (!pc) return;

        await pc.setRemoteDescription(offer);

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

        await pc.setRemoteDescription(answer);
    });

    // ─────────────────────────────
    // CANDIDATE
    // ─────────────────────────────

    socket.on("candidate", async ({ from, candidate }) => {

        const pc = peers[from];
        if (!pc) return;

        try {
            await pc.addIceCandidate(candidate);
        } catch (e) {
            console.error(e);
        }
    });

    // ─────────────────────────────
    // USER LEFT
    // ─────────────────────────────

    socket.on("user-left", (id) => {
        removePeer(id);
    });

    start();

})();