import string

_PUNCT = string.punctuation + "«»„“”‘’‚—–…№"
_TABLE = str.maketrans({ch: " " for ch in _PUNCT})


def normalize_answer(s: str) -> str:
    """Loose form for comparing answers: case, ё/е, punctuation, quotes and spacing are ignored."""
    s = s.casefold().replace("ё", "е").translate(_TABLE)
    return " ".join(s.split())
