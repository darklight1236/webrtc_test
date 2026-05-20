(() => {

    const socket = io();

    const roomId = "test-room";

    const container =
        document.querySelector(".container");

    const localVideo =
        document.getElementById("local");

    let localStream;

    // PEERS

    const peers = {};

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
    // CREATE VIDEO CARD
    // ─────────────────────────────

    function createVideoCard(id) {

        if (
            document.getElementById(`client-${id}`)
        ) {
            return;
        }

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

        username.innerText =
            `User ${id.slice(0, 4)}`;

        client.appendChild(video);

        client.appendChild(username);

        container.appendChild(client);
    }

    // ─────────────────────────────
    // REMOVE USER
    // ─────────────────────────────

    function removePeer(id) {

        console.log("REMOVE:", id);

        if (peers[id]) {

            peers[id].close();

            delete peers[id];

        }

        const el =
            document.getElementById(
                `client-${id}`
            );

        if (el) {

            el.remove();

        }

    }

    // ─────────────────────────────
    // CREATE PEER
    // ─────────────────────────────

    function createPeer(id) {

        if (peers[id]) {

            return peers[id];

        }

        console.log("CREATE PEER:", id);

        createVideoCard(id);

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

        // REMOTE TRACK

        pc.ontrack = (event) => {

            console.log("TRACK:", id);

            const video =
                document.getElementById(
                    `video-${id}`
                );

            if (!video.srcObject) {

                video.srcObject =
                    event.streams[0];

                detectSpeaking(
                    event.streams[0],
                    `client-${id}`
                );
            }

        };

        // ICE

        pc.onicecandidate = (event) => {

            if (event.candidate) {

                socket.emit("candidate", {

                    to: id,

                    candidate:
                        event.candidate

                });

            }

        };

        // STATE

        pc.onconnectionstatechange = () => {

            console.log(
                id,
                pc.connectionState
            );

            // НЕ удаляем disconnected
            // иначе peer рушится
            // при кратких reconnect

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
    // USERS
    // ─────────────────────────────

    socket.on("users", async (users) => {

        for (const id of users) {

            if (id === socket.id) continue;

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

        console.log("OFFER:", from);

        const pc =
            createPeer(from);

        try {

            await pc.setRemoteDescription(
                new RTCSessionDescription(offer)
            );

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

        } catch (e) {

            console.error(e);

        }

    });

    // ─────────────────────────────
    // ANSWER
    // ─────────────────────────────

    socket.on("answer", async ({ from, answer }) => {

        console.log("ANSWER:", from);

        const pc = peers[from];

        if (!pc) return;

        try {

            await pc.setRemoteDescription(
                new RTCSessionDescription(answer)
            );

        } catch (e) {

            console.error(e);

        }

    });

    // ─────────────────────────────
    // ICE
    // ─────────────────────────────

    socket.on("candidate", async ({ from, candidate }) => {

        const pc = peers[from];

        if (!pc) return;

        try {

            await pc.addIceCandidate(
                new RTCIceCandidate(candidate)
            );

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