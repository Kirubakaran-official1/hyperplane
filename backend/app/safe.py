"""A request-body base class for the customer service (round 17c): any text with a control character (a NUL byte, ESC, …) is refused before a
handler or a database call sees it — a NUL would make the database driver fail (a 500), and no form value ever needs one. Tab and line breaks
stay allowed (helpdesk messages). Nested values are checked too."""
import unicodedata

from pydantic import BaseModel, model_validator


def _walk(v, depth=0):
    if depth > 8:
        raise ValueError("too deeply nested")
    if isinstance(v, str):
        if any(unicodedata.category(c) == "Cc" and c not in "\n\r\t" for c in v):
            raise ValueError("control characters are not allowed")
    elif isinstance(v, dict):
        for k, x in v.items():
            _walk(k, depth + 1)
            _walk(x, depth + 1)
    elif isinstance(v, (list, tuple)):
        for x in v:
            _walk(x, depth + 1)


class SafeModel(BaseModel):
    @model_validator(mode="before")
    @classmethod
    def _no_control_characters(cls, data):
        _walk(data)
        return data
