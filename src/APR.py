import time
import json
import ujson
import re
import os
import shutil
from prompting.engine import PromptingEngine
from jinja2 import Environment, FileSystemLoader, select_autoescape
from playwright.sync_api import sync_playwright
from setup_env import API_DICT, DEBUG
from pathlib import Path
from datetime import datetime


env = Environment(
    loader=FileSystemLoader("templates"),
    autoescape=select_autoescape(['html', 'xml'])
)

META_PATH = "data/meta_data.json"


def store_information(file_path, information):
    """Saves extracted information into the metadata file."""
    all_metadata = {}
    if os.path.exists(META_PATH):
        try:
            with open(META_PATH, "r") as f:
                content = f.read().strip()
                if content:
                    all_metadata = json.loads(content)
        except json.JSONDecodeError:
            print("[store_information] Warning: Corrupted JSON, starting fresh.")

    filename = os.path.basename(file_path)
    file_id = filename + ".pdf"

    metadata = {
        "model": "deepseek-ai/DeepSeek-R1-Distill-Qwen-1.5B",
        "ID": file_id,
        "original_filename": filename,
        "created_at": str(datetime.now())
    }

    metadata.update(information)

    all_metadata[file_id] = metadata

    with open(META_PATH, "w") as f:
        json.dump(all_metadata, f, indent=2)
    
    return file_id


def create_pdf_report(file_id):
    """Builds HTML from information in metadata and converts it to a PDF."""
    all_metadata = {}
    if not os.path.exists(META_PATH):
        print(f"Metadata file not found: {META_PATH}")
        return None

    with open(META_PATH, "r") as f:
        content = f.read().strip()
        if content:
            all_metadata = json.loads(content)

    information = all_metadata.get(file_id)
    if not information:
        print(f"No metadata found for {file_id}")
        return None

    parsed_html = buildHtml(information)
    
    original_file_name = file_id.removesuffix('.pdf')
    pdf_path = html_to_pdf(parsed_html, original_file_name)

    # Update metadata with PDF creation stats
    stats = os.stat(pdf_path)
    information["created_at"] = time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(stats.st_ctime))
    information["size_bytes"] = stats.st_size
    
    all_metadata[file_id] = information
    with open(META_PATH, "w") as f:
        json.dump(all_metadata, f, indent=2)

    return pdf_path


def GenerateReport(file):
    """
    Extracts information from a file, stores it in a metadata file,
    and removes the original file.
    Returns the ID for the newly created entry.
    """
    try:
        information = extractInformation(file)
        file_id = store_information(file, information)
        remove_file(file)
        return file_id
    except Exception as e:
        if DEBUG:
            print(f"[GenerateReport] Exception occurred:\n{e}")
        move_file(file)
        return None


def move_file(file, dest_dir="./tmp/error"):
    """Moves passed file to the /tmp/error folder."""
    try:
        os.makedirs(dest_dir, exist_ok=True)
        filename = os.path.basename(file)
        dest_path = os.path.join(dest_dir, filename)
        if os.path.exists(file):
            shutil.move(file, dest_path)
        else:
            # File might have been removed or never existed.
            # In the context of an error, this is not critical.
            pass
    except Exception as e:
        if DEBUG:
            print(f"Error moving file {file}: {e}")


def update_metadata(updated_entry: dict, meta_path="./data/meta_data.json"):
    if "ID" not in updated_entry:
        raise ValueError("Missing 'ID' in the provided metadata dictionary.")

    file_id = updated_entry["ID"]

    if os.path.exists(meta_path):
        with open(meta_path, "r", encoding="utf-8") as f:
            try:
                metadata = ujson.load(f)
            except Exception as e:
                raise ValueError(f"Failed to parse meta_data.json: {e}")
    else:
        metadata = {}

    updated_data = {k: v for k, v in updated_entry.items() if k != "ID"}

    # Update or create the entry
    metadata[file_id] = metadata.get(file_id, {})
    metadata[file_id].update(updated_data)

    with open(meta_path, "w", encoding="utf-8") as f:
        ujson.dump(metadata, f, indent=2)

def remove_file(file):
    """Function to remove the file after processing."""
    try:
        if os.path.exists(file):
            os.remove(file)
    except OSError as e:
        if DEBUG:
            print(f"Error removing file {file}: {e}")


def html_to_pdf(html_string, file):
    """Converts an HTML string to a PDF file."""
    file_name = os.path.basename(file)
    output_pdf_path = os.path.join('./data/verwerkt', f"{file_name}.pdf")
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        page.set_content(html_string)
        page.pdf(path=output_pdf_path, format='A4', print_background=True)
        browser.close()
    return output_pdf_path


def extractInformation(file):
    """Extracts structured information from a raw text file."""
    engine = PromptingEngine(API_DICT, "src/prompting/templates.json")
    with open(file, 'r') as f:
        verhoor = f.read()

    prompts = {
        "datum": "Wat is de datum van het verhoor? Geef alleen de datum in de vorm van [dag]-[maand]-[jaar]",
        "tijd": "Hoe laat was het verhoor? Geef alleen de exacte tijd zoals die in de gegeven text staat",
        "verbalisanten": "Wie zijn de verbalisanten in het verhoor? Geef je reactie als [titel1]: [naam1] --- [titel2]: [naam2]",
        "locatie": "Waar was het verhoor?",
        "verdachte": "Hoe identificeerde verdachte zich? geef alleen de exacte naan",
        "geboortedag": "Wat is de geboortedatum van de verdachte? Geen alleen de datum in de vorm van [dag]-[maand]-[jaar]",
        "geboortestad": "What is de geboortestad van de verdachte? Geef alleen de stad",
        "woonadres": "Wat is het woonadres van de verdachte? Geef enkel straatnaam en het nummer",
        "woonstad": "Wat is de woonstad van de verdachte? Geef enkel de stad"
    }

    information = {}
    for key, prompt_text in prompts.items():
        prompt = f"{prompt_text}\n\n\nVerhoor:\n{verhoor}"
        information[key] = engine.generate_response("verhoor-vragen-gpt-4o", prompt=prompt)

    information["proces_verbaal"] = engine.generate_response("verhoor-samenvatting-gpt-4o", prompt=verhoor)

    return information


def buildHtml(information):
    """Builds the HTML for the report from extracted information."""
    image_path = "../static/media/PolitieLogoFullTransparant.png"
    pattern = r"[titel1]:\s*(.*[a-zA-Z])\s{0,3}---\s{0,3}[titel2]:\s*(.*)"
    
    verbalisanten_str = information.get("verbalisanten", "")
    matches = re.findall(pattern, verbalisanten_str)
    verbalisanten_list = matches[0] if matches else ("", "")

    template = env.get_template("pvtemplate.html")
    
    context = {
        "DATUM": information.get("datum"),
        "TIJD": information.get("tijd"),
        "VERBALISANTEN": verbalisanten_list,
        "LOCATIE": information.get("locatie"),
        "VERDACHTE": information.get("verdachte"),
        "GEBOORTEDAG": information.get("geboortedag"),
        "GEBOORTESTAD": information.get("geboortestad"),
        "WOONADRES": information.get("woonadres"),
        "WOONSTAD": information.get("woonstad"),
        "VERKLARING": information.get("proces_verbaal"),
        "IMG_PATH": image_path
    }
    
    rendered_html = template.render(**context)
    return rendered_html


if __name__ == "__main__":
    # Example usage:
    # Create a dummy file for testing
    test_file_path = "./tmp/test.txt"
    os.makedirs(os.path.dirname(test_file_path), exist_ok=True)
    with open(test_file_path, "w") as f:
        f.write("Dit is een test verhoor.")
    
    # Step 1: Generate the metadata from the raw file
    file_id = GenerateReport(test_file_path)
    if file_id:
        print(f"Successfully processed {test_file_path} and created metadata with ID: {file_id}")

        # Step 2: Create the PDF report from the generated metadata
        pdf_path = create_pdf_report(file_id)
        if pdf_path:
            print(f"Successfully created PDF report: {pdf_path}")
        else:
            print(f"Failed to create PDF report for {file_id}")
    else:
        print(f"Failed to process {test_file_path}")