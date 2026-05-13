from app.services.text_chunker import chunk_text


def test_chunk_text_always_advances_when_sentence_break_is_near_start():
    text = "A. " + ("supervision " * 700)

    chunks = chunk_text(text, "doc-1")

    assert chunks
    offsets = [chunk["char_offset"] for chunk in chunks]
    assert offsets == sorted(set(offsets))
    assert chunks[-1]["char_offset"] < len(text)
