(() => {

    const socket = io();

    const roomId = "test-room";

    const container =
        document.querySelector(".container");

    const localVideo =
        document.getElementById("local");

    let localStream;

    const peers = {};

    const pendingCandidates = {};

    // ─────────────────────────────
    // START
    // ─────────────────────────────

    async function start() {

        localStream =
            await navigator.mediaDevices.getUserMedia({

                video: true,
                audio: true

            });

        localVideo.srcObject =
            localStream;

        detectSpeaking(
            localStream,
            "local-client"
        );

        socket.emit(
            "join-room",
            roomId
        );
    }

    // ─────────────────────────────
    // CREATE PEER
    // ─────────────────────────────

    function createPeer(id) {

        const pc =
            new RTCPeerConnection({

                iceServers: [

                    {
                        urls:
                            "stun:stun.l.google.com:19302"
                    },

                    {
                        urls:
                            "turn:82.26.150.172:3478?transport=tcp",

                        username: "test",

                        credential: "test123"
                    }
                ]
            });

        peers[id] = pc;

        // LOCAL TRACKS

        localStream.getTracks().forEach(track => {

            pc.addTrack(
                track,
                localStream
            );

        });

        // CREATE VIDEO CARD

        const client =
            document.createElement("div");

        client.className = "client";

        client.id = `client-${id}`;

        const video =
            document.createElement("video");

        video.autoplay = true;

        video.playsInline = true;

        video.id = `video-${id}`;

        const username =
            document.createElement("div");

        username.className = "username";

        username.innerText = "User";

        client.appendChild(video);

        client.appendChild(username);

        container.appendChild(client);

        // REMOTE TRACK

        pc.ontrack = (event) => {

            console.log("TRACK:", id);

            video.srcObject =
                event.streams[0];

            detectSpeaking(
                event.streams[0],
                `client-${id}`
            );
        };

        // ICE

        pc.onicecandidate = (event) => {

            if (event.candidate) {

                socket.emit("candidate", {

                    to: id,

                    candidate: event.candidate

                });

            }

        };

        // CONNECTION STATE

        pc.onconnectionstatechange = () => {

            console.log(
                "STATE:",
                id,
                pc.connectionState
            );

            if (

                pc.connectionState === "failed" ||
                pc.connectionState === "closed" ||
                pc.connectionState === "disconnected"

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

        console.log("REMOVE:", id);

        if (peers[id]) {

            peers[id].close();

            delete peers[id];

        }

        if (pendingCandidates[id]) {

            delete pendingCandidates[id];

        }

        const client =
            document.getElementById(
                `client-${id}`
            );

        if (client) {

            client.remove();

        }

    }

    // ─────────────────────────────
    // USERS
    // ─────────────────────────────

    socket.on("users", async (users) => {

        // Новый пользователь создаёт offer ВСЕМ старым

        for (const id of users) {

            if (id === socket.id) continue;

            if (peers[id]) continue;

            console.log("CONNECT TO:", id);

            const pc = createPeer(id);

            const offer =
                await pc.createOffer();

            await pc.setLocalDescription(
                offer
            );

            socket.emit("offer", {

                to: id,

                offer:
                    pc.localDescription

            });

        }

    });

    // ─────────────────────────────
    // OFFER
    // ─────────────────────────────

    socket.on("offer", async ({ from, offer }) => {

        console.log("OFFER FROM:", from);

        if (!peers[from]) {

            createPeer(from);

        }

        const pc = peers[from];

        await pc.setRemoteDescription(
            new RTCSessionDescription(offer)
        );

        flushCandidates(from);

        const answer =
            await pc.createAnswer();

        await pc.setLocalDescription(
            answer
        );

        socket.emit("answer", {

            to: from,

            answer:
                pc.localDescription

        });

    });

    // ─────────────────────────────
    // ANSWER
    // ─────────────────────────────

    socket.on("answer", async ({ from, answer }) => {

        console.log("ANSWER FROM:", from);

        const pc = peers[from];

        if (!pc) return;

        await pc.setRemoteDescription(
            new RTCSessionDescription(answer)
        );

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

            pendingCandidates[from].push(
                candidate
            );

            return;
        }

        try {

            await pc.addIceCandidate(
                new RTCIceCandidate(candidate)
            );

        } catch (e) {

            console.error(e);

        }

    });

    // ─────────────────────────────
    // FLUSH ICE
    // ─────────────────────────────

    function flushCandidates(id) {

        const pc = peers[id];

        if (!pc) return;

        if (pendingCandidates[id]) {

            for (const candidate of pendingCandidates[id]) {

                pc.addIceCandidate(
                    new RTCIceCandidate(candidate)
                );

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

    // ─────────────────────────────
    // SPEAKING DETECTION
    // ─────────────────────────────

    function detectSpeaking(stream, clientId) {

        const audioContext =
            new AudioContext();

        const analyser =
            audioContext.createAnalyser();

        const microphone =
            audioContext.createMediaStreamSource(
                stream
            );

        const dataArray =
            new Uint8Array(analyser.fftSize);

        microphone.connect(analyser);

        function checkAudio() {

            analyser.getByteTimeDomainData(
                dataArray
            );

            let volume = 0;

            for (
                let i = 0;
                i < dataArray.length;
                i++
            ) {

                volume += Math.abs(
                    dataArray[i] - 128
                );

            }

            const speaking =
                volume > 2500;

            const client =
                document.getElementById(
                    clientId
                );

            if (client) {

                if (speaking) {

                    client.classList.add(
                        "speaking"
                    );

                } else {

                    client.classList.remove(
                        "speaking"
                    );

                }

            }

            requestAnimationFrame(
                checkAudio
            );
        }

        checkAudio();
    }

    start();

})();