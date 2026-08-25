from flask import Flask, request, jsonify, send_from_directory
from werkzeug.utils import secure_filename
from pathlib import Path
import os

from main import (
    read_resume,
    validate_resume,
    clean_resume,
    generate_portfolio_data,
    render_portfolio
)

app = Flask(__name__)

@app.route("/")
def home():
    return send_from_directory(app.root_path, "index.html")


@app.route("/app.js")
def app_js():
    return send_from_directory(app.root_path, "app.js")


@app.route("/frontend.css")
def frontend_css():
    return send_from_directory(app.root_path, "frontend.css")


@app.route("/style.css")
def style_css():
    return send_from_directory(app.root_path, "style.css")


UPLOAD_FOLDER = "uploads"
os.makedirs(UPLOAD_FOLDER, exist_ok=True)


@app.route("/generate", methods=["POST"])
def generate():

    # Check whether a file was uploaded
    if "resume" not in request.files:
        return jsonify({
            "status": "error",
            "message": "No resume file uploaded."
        }), 400

    file = request.files["resume"]

    if file.filename == "":
        return jsonify({
            "status": "error",
            "message": "No resume selected."
        }), 400

    # Only allow TXT and DOCX
    extension = Path(file.filename).suffix.lower()

    if extension not in [".txt", ".docx"]:
        return jsonify({
            "status": "error",
            "message": "Only .txt and .docx resume files are supported."
        }), 400

    # Save uploaded file
    filename = secure_filename(file.filename)
    file_path = os.path.join(UPLOAD_FOLDER, filename)

    file.save(file_path)

    try:

        # Read resume
        resume_text = read_resume(file_path)

        if resume_text is None:
            return jsonify({
                "status": "error",
                "message": "Could not read the resume."
            }), 400

        # Validate
        if not validate_resume(resume_text):
            return jsonify({
                "status": "error",
                "message": "Resume is empty or too short."
            }), 400

        # Clean
        cleaned_resume = clean_resume(resume_text)

        # Gemini
        portfolio_data = generate_portfolio_data(cleaned_resume)

        # Generate HTML
        render_portfolio(portfolio_data)

        # Read generated HTML
        with open("portfolio.html", "r", encoding="utf-8") as f:
            html = f.read()

        return jsonify({
            "status": "ok",
            "html": html
        })

    except Exception as error:

        return jsonify({
            "status": "error",
            "message": str(error)
        }), 500


if __name__ == "__main__":
    app.run()
