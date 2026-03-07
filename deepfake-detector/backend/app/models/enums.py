from enum import Enum


class Label(str, Enum):
    LIKELY_REAL = "likely_real"
    UNCERTAIN = "uncertain"
    LIKELY_FAKE = "likely_fake"


class SourceType(str, Enum):
    CALL = "call"
    VIDEO = "video"
    FILE = "file"


class ClientPlatform(str, Enum):
    ANDROID = "android"
    WEB = "web"
    DESKTOP = "desktop"
