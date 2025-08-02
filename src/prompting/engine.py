import json
import os
import requests
import websocket
import asyncio
from setup_env import API_DICT
from openai import OpenAI


class PromptingEngine:
    """
    A reusable engine to load prompt templates and generate completions.
    Templates should be defined in a JSON file with the structure:
    {
      "template_key": {
        "system": "System prompt with {placeholders}",
        "user": "User prompt with {placeholders}"        
      },
      ...
    }
    """

    def __init__(self, api, templates_path: str):
        """
        Initializes the PromptingEngine by loading the prompt templates from a JSON file
        and setting up the OpenAI API key if provided.

        :param api: Dictionary containing the API credentials, expected to have an "openAI" key with the API key.
        :param templates_path: Path to the JSON file containing the prompt templates.
        """
        with open(templates_path, 'r', encoding='utf-8') as f:
            # Loads the prompt templates from the file.
            self.templates = json.load(f)

        # Provided API keys:
        if api.get("openAI", ""):
            self.openAI_key = api["openAI"]

        if api.get("anthropic", ""):
            self.anthropic_key = api["anthropic"]

        if api.get("cintiqo", ""):
            self.cintiqo_key = api["cintiqo"]

    def generate_prompt(self, template_name: str, **kwargs) -> tuple[str, str]:
        """
        Generates the system and user prompts based on the specified template and keyword arguments.

        :param template_name: The key of the template to use from the loaded templates.
        :param kwargs: The dynamic variables that will replace placeholders in the template.
        :return: A tuple containing the generated system and user prompts.
        :raises KeyError: If the specified template name is not found in the templates.
        """
        template = self.templates.get(
            template_name)  # Retrieves the template based on the name.
        if not template:
            # Raises an error if the template is missing.
            raise KeyError(
                f"Template '{template_name}' not found in templates.")

        # Fills the system prompt template with variables.
        system_prompt = template.get('system', '').format(**kwargs)
        # Fills the user prompt template with variables.
        user_prompt = template.get('user', '').format(**kwargs)

        return (system_prompt, user_prompt)  # Returns the generated prompts.

    def generate_response(self, template_name, **kwargs):
        """
        Generates a response from the specified model (e.g., OpenAI GPT) using the given template and variables.

        :param template_name: The template key to use for generating the system and user prompts.
        :param kwargs: The dynamic variables to substitute into the template.
        :return: The generated response from the model.
        :raises KeyError: If the template is not found in the loaded templates.
        """
        system_prompt, user_prompt = self.generate_prompt(
            template_name, **kwargs)

        template = self.templates.get(template_name)
        model = template.get("model", "")

        match model:
            # OAI models
            case "gpt-4o":
                res = self._generate_openAI(system_prompt, user_prompt, model)
            # Anthropic models
            case "claude-3-7-sonnet-20250219":
                res = self._generate_anthropic(
                    system_prompt, user_prompt, model)
            # Cintiqo models
            case "QoPilot-1":
                res = self._generate_QoPilot(system_prompt, user_prompt, model)
            case _:
                print(system_prompt, user_prompt, model)
                raise NotImplementedError("Passed model not found!")

        return res  # Returns the generated response.

    def _generate_QoPilot(self, system_prompt, user_prompt, model):
        if not self.cintiqo_key:
            raise NotImplementedError("Cintiqo API key not provided.")

        payload = {
            "action": "prompt",
            "prompt": user_prompt,
            "conversation": False
        }

        uri = "ws://127.0.0.1:8001/ws/QoPilot"
        ws = websocket.create_connection(uri)
        ws.send(json.dumps(payload))
        response = ws.recv()
        second_res = ws.recv()
        ws.close()

        return response, second_res

    def _generate_openAI(self, system_prompt, user_prompt, model):
        """
        Makes a request to OpenAI's API to generate a response based on the provided prompts.

        :param system_prompt: The system prompt to guide the model's behavior.
        :param user_prompt: The user prompt containing the user's query.
        :param model: The model to use (e.g., "gpt-4o").
        :return: The generated response from OpenAI.
        :raises NotImplementedError: If the OpenAI API key is not provided.
        """
        if not self.openAI_key:
            # Raises an error if the OpenAI key is not set.
            raise NotImplementedError("OpenAI API key not provided.")

        # Initializes the OpenAI client with the API key.
        client = OpenAI(api_key=self.openAI_key, timeout=120.0, max_retries=3)

        messages = []  # Initializes a list to hold the conversation messages.
        if system_prompt:
            # Adds the system prompt if it exists.
            messages.append({"role": "system", "content": system_prompt})
        # Adds the user prompt.
        messages.append({"role": "user", "content": user_prompt})

        response = client.chat.completions.create(  # Makes the API call to OpenAI to generate a completion.
            model=model,
            messages=messages
        )
        # Returns the content of the first response choice.
        return response.choices[0].message.content

    def _generate_anthropic(self, system_prompt, user_prompt, model):
        """
        Makes a request to Claude's API to generate a response based on the provided prompts.

        :param system_prompt: The system prompt to guide the model's behavior.
        :param user_prompt: The user prompt containing the user's query.
        :param model: The model to use (e.g., "claude-3-7-sonnet").
        :return: The generated response from Claude.
        :raises NotImplementedError: If the Claude API key is not provided.
        """
        if not self.anthropic_key:
            # Raises an error if the Claude key is not set.
            raise NotImplementedError("Claude API key not provided.")

        client = anthropic.Anthropic(api_key=self.anthropic_key)

        # Create the message using Anthropic's API format
        response = client.messages.create(
            model=model,
            system=system_prompt,
            messages=[
                {
                    "role": "user",
                    "content": user_prompt
                }
            ],
            max_tokens=4000
        )

        # Return the text content from the response
        return response.content[0].text


if __name__ == "__main__":
    engine = PromptingEngine(API_DICT, "src/prompting/templates.json")

    # This is just an example - replace "openai_test" with an actual template name from your templates.json
    response = engine.generate_response(
        "verhoor-vragen-gpt-4o",
        prompt="WAAALUIGI")
    print(response)
