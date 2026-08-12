# Future NPR and 3D-to-2D appearance

The intended non-photorealistic graph is:

```text
Agent → geometry → materials / lighting / outlines
      → toon or cel rendering → real-time or offline output
```

Future work may include toon shaders, cel bands, outlines, orthographic rendering, stylized lighting, limited-frame animation, anime-style rendering, 三渲二, and sprite capture from 3D.

These techniques need render-style data, versioned shader provenance, fixed-camera comparison, silhouette/line validation, frame-consistency checks, and target-engine performance evidence. No NPR renderer or shader is shipped in 0.1.
