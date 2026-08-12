from copy import deepcopy


BASE_SPEC = {
    "schema_version": "1",
    "project": {"name": "fixture"},
    "intent": {"description": "A copyright-safe test fixture"},
    "representation": {"type": "3d"},
    "generation": {"adapter": "manual", "source": "fixture.glb", "license": "CC0-1.0"},
    "output": {"adapter": "local", "destination": "processed.glb"},
    "workflow": ["plan", "generate"],
}


def base_spec():
    return deepcopy(BASE_SPEC)
