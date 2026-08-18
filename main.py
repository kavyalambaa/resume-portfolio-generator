def read_resume():
    """Read the resume from resume.txt."""
    try:
        with open("resume.txt", "r", encoding="utf-8") as file:
            resume = file.read()

        return resume

    except FileNotFoundError:
        print("Error: resume.txt not found.")
        return None


def validate_resume(resume):
    """Check whether the resume has enough usable content."""
    if not resume.strip():
        print("Error: resume.txt is empty.")
        return False

    if len(resume.strip()) < 50:
        print("Error: resume.txt is too short.")
        return False

    return True


def clean_resume(resume):
    """Remove unnecessary spaces and blank lines from the resume."""
    lines = resume.splitlines()

    cleaned_lines = []

    for line in lines:
        line = line.strip()

        if line:
            cleaned_lines.append(line)

    return "\n".join(cleaned_lines)


def main():
    """Read, validate, and clean the resume."""
    resume_text = read_resume()

    if resume_text is None:
        return

    if not validate_resume(resume_text):
        return

    cleaned_resume = clean_resume(resume_text)

    print("Cleaned resume:")
    print("----------------")
    print(cleaned_resume)


if __name__ == "__main__":
    main()