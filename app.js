(() => {

    const localVideo = document.getElementById("local");
    const remoteVideo = document.getElementById("remote");

    const roomId = "test-room";

    const socket = io();

    let peer;
    let localStream;

    let pendingCandidates = [];

    function createPeer() {

        const p = new RTCPeerConnection({

            // iceServers: [
            //     {
            //         urls: "stun:stun.l.google.com:19302"
            //     },
            //     {
            //         urls: "turn:82.26.150.172:3478",
            //         username: "test",
            //         credential: "test123"
            //     }
            // ]

            iceServers: [
                {
                    urls: "stun:stun.l.google.com:19302"
                },
                {
                    urls: "turn:82.26.150.172:3478?transport=udp",
                    username: "test",
                    credential: "test123"
                },
                {
                    urls: "turn:82.26.150.172:3478?transport=tcp",
                    username: "test",
                    credential: "test123"
                }
            ]

            // iceServers: [
            //     {
            //         urls: "stun:stun.l.google.com:19302"
            //     },
            //     {
            //         urls: "turn:openrelay.metered.ca:80",
            //         username: "openrelayproject",
            //         credential: "openrelayproject"
            //     }
            // ]

        });

        p.ontrack = (event) => {

            console.log("REMOTE TRACK");

            remoteVideo.srcObject = event.streams[0];
        };

        p.onicecandidate = (event) => {

            if (event.candidate) {

                console.log("SEND CANDIDATE");

                socket.emit("candidate", {
                    candidate: event.candidate,
                    roomId
                });

            }
        };

        p.onconnectionstatechange = () => {

            console.log(
                "CONNECTION STATE:",
                peer.connectionState
            );

        };

        p.oniceconnectionstatechange = () => {

            console.log(
                "ICE STATE:",
                peer.iceConnectionState
            );

        };

        return p;
    }

    async function start() {

        peer = createPeer();

        socket.emit("join", roomId);

        localStream = await navigator.mediaDevices.getUserMedia({

            video: true,
            audio: true

        });

        localVideo.srcObject = localStream;

        localStream.getTracks().forEach(track => {

            peer.addTrack(track, localStream);

        });

        setupSocketHandlers();
    }

    function setupSocketHandlers() {

        socket.on("user-joined", async () => {

            console.log("USER JOINED");

            const offer = await peer.createOffer();

            await peer.setLocalDescription(offer);

            socket.emit("offer", {
                offer,
                roomId
            });

        });

        socket.on("offer", async (offer) => {

            console.log("GOT OFFER");

            await peer.setRemoteDescription(
                new RTCSessionDescription(offer)
            );

            for (const candidate of pendingCandidates) {

                await peer.addIceCandidate(
                    new RTCIceCandidate(candidate)
                );

            }

            pendingCandidates = [];

            const answer = await peer.createAnswer();

            await peer.setLocalDescription(answer);

            socket.emit("answer", {
                answer,
                roomId
            });

        });

        socket.on("answer", async (answer) => {

            console.log("GOT ANSWER");

            await peer.setRemoteDescription(
                new RTCSessionDescription(answer)
            );

            for (const candidate of pendingCandidates) {

                await peer.addIceCandidate(
                    new RTCIceCandidate(candidate)
                );

            }

            pendingCandidates = [];

        });

        socket.on("candidate", async (candidate) => {

            console.log("GOT CANDIDATE");

            if (!peer.remoteDescription) {

                console.log("QUEUE CANDIDATE");

                pendingCandidates.push(candidate);

                return;
            }

            try {

                await peer.addIceCandidate(
                    new RTCIceCandidate(candidate)
                );

            } catch (e) {

                console.error(e);

            }

        });

    }

    start();

})();