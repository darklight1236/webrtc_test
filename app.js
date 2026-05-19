(() => {

    const localVideo = document.getElementById("local");
    const remoteVideo = document.getElementById("remote");
    const roomId = "test-room";

    const socket = io();
    let peer;
    let localStream;

    socket.emit("join", roomId);

    async function startMedia() {

        localStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true
        });

        localVideo.srcObject = localStream;

        peer = createPeer();

        localStream.getTracks().forEach(track => {
            peer.addTrack(track, localStream);
        });
    }

    function createPeer() {

        const p = new RTCPeerConnection({
            iceServers: [
                { urls: "stun:stun.l.google.com:19302" }
            ]
        });

        p.ontrack = (event) => {
            remoteVideo.srcObject = event.streams[0];
        };

        p.onicecandidate = (event) => {
            if (event.candidate) {
                socket.emit("candidate", {
                    candidate: event.candidate,
                    roomId
                });
            }
        };

        return p;
    }

    socket.on("user-joined", async () => {
        console.log("USER JOINED → I AM INITIATOR");

        const offer = await peer.createOffer();
        await peer.setLocalDescription(offer);

        socket.emit("offer", {
            offer,
            roomId
        });
    });

    socket.on("offer", async (offer) => {

        console.log("GOT OFFER");

        await peer.setRemoteDescription(offer);

        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);

        socket.emit("answer", {
            answer,
            roomId
        });
    });

    socket.on("answer", async (answer) => {

        console.log("GOT ANSWER");

        await peer.setRemoteDescription(answer);
    });

    socket.on("candidate", async ({ candidate }) => {

        console.log("GOT CANDIDATE");

        try {
            await peer.addIceCandidate(candidate);
        } catch (e) {
            console.error(e);
        }
    });

    startMedia();

    window.call = async () => {
        console.log("manual call ignored in new flow");
    };

})();