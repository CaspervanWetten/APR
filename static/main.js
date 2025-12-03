const ws = new WebSocket("ws://145.90.76.152:8080/ws/llama");
const chatBox = document.querySelector(".chat-box");

ws.onopen = () => {
  console.log("WebSocket connection opened");
  ws.send(JSON.stringify({ action: "connection" }));

  setInterval(() => {
    ws.send(JSON.stringify({ action: "heartbeat" }));
    console.log("Sent heartbeat");
  }, 5000);
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data); // Parse event.data, not event.response

  switch (data.response) {
    case "connected":
      console.log("connected");
      break;

    case "initiated":
      console.log("LLM initiated");
      break;

    case "heartbeat":
      console.log("Received heartbeat");
      break;

    case "done":
      const botResponse = document.createElement("div");
      botResponse.textContent = data.data;
      chatBox.appendChild(botResponse);
      break;

    case "error":
      console.log(data.data);
      break;

    default:
      console.log("Unexpected response type:", data.response); // Handle unexpected types
      break;
  }
};

document.addEventListener("DOMContentLoaded", () => {
  // Chatbot interaction
  const sendBtn = document.getElementById("send-btn");
  const chatInput = document.getElementById("chat-input");
  const chatBox = document.querySelector(".chat-box");

  sendBtn.addEventListener("click", () => {
    const message = chatInput.value;
    if (message) {
      const userMessage = document.createElement("div");
      userMessage.textContent = `You: ${message}`;
      chatBox.appendChild(userMessage);
      chatInput.value = "";
      ws.send(JSON.stringify({ action: "prompt", prompt: message }));

      // Scroll chat to the bottom
      chatBox.scrollTop = chatBox.scrollHeight;
    }
  });

  // Send file and selected template
  const sendFileBtn = document.getElementById("send-file-btn");
  const fileInput = document.getElementById("file-input");
  const promptTemplateSelect = document.getElementById("prompt-template");

  sendFileBtn.addEventListener("click", () => {
    const file = fileInput.files[0];
    const selectedTemplate = promptTemplateSelect.value;

    if (file && selectedTemplate) {
      // Read the JSON file content
      const reader = new FileReader();
      
      reader.onload = () => {
        try {
          const fileContent = JSON.parse(reader.result); // Parse the file content as JSON

          // Send the file content along with the selected template through WebSocket
          ws.send(JSON.stringify({
            action: "json_upload",
            fileContent: fileContent,
            template: selectedTemplate
          }));

          // Optionally, you can display a message in the chat
          const userMessage = document.createElement("div");
          userMessage.textContent = `File and Template sent: ${file.name}, Template: ${selectedTemplate}`;
          chatBox.appendChild(userMessage);

          // Scroll chat to the bottom
          chatBox.scrollTop = chatBox.scrollHeight;
        } catch (error) {
          console.error("Error reading or parsing JSON file:", error);
          alert("Failed to parse JSON file.");
        }
      };

      reader.readAsText(file); // Read the file as text, which will be parsed as JSON

    } else {
      alert("Please select a file and template first.");
    }
  });
});
