---
title: Showcase
---

# Showcase

![logo](guide/logo.svg?raw=true)

A **Markdown** document with *every* feature, ~~almost~~, plus `inline code`, <kbd>Ctrl</kbd>+<kbd>P</kbd>,
a [relative link](guide/intro.md#usage), an [external link](https://example.com) and an emoji :rocket:.

> [!NOTE]
> Alerts use the GitHub syntax.

> [!WARNING]
> Printing uses the light theme.

## Code

```ts
interface TreeNode {
  name: string
  children?: TreeNode[] // directories only
}

export const depth = (node: TreeNode): number =>
  1 + Math.max(0, ...(node.children ?? []).map(depth))
```

```python
def fib(n: int) -> int:
    """Return the n-th Fibonacci number."""
    return n if n < 2 else fib(n - 1) + fib(n - 2)
```

```
plain block without a language
```

## Tables

| Feature        | Status | Notes                  |
| :------------- | :----: | ---------------------: |
| File tree      |   ✅   | pruned to Markdown     |
| Contents       |   ✅   | follows the scroll     |
| Print          |   ✅   | light theme, paginated |

## Lists

1. First
2. Second
   - nested bullet
   - another
     1. deep
3. Third

- [x] Render tasks
- [ ] Ship it

Term
: A definition with `code`.

## Math

Euler's identity is $e^{i\pi} + 1 = 0$, and a display formula:

$$
\int_{-\infty}^{\infty} e^{-x^2}\,dx = \sqrt{\pi}
$$

## Diagram

```mermaid
flowchart LR
  A[Open folder] --> B{Markdown?}
  B -- yes --> C[Render]
  B -- no --> D[Skip]
  C --> E[Print]
```

## Quotes

> A quote with a footnote.[^1]

<details>
<summary>Raw HTML</summary>

Hidden until opened.

</details>

---

## Long section

Paragraph 1. Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.

Paragraph 2. Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.

Paragraph 3. Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.

Paragraph 4. Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.

Paragraph 5. Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.

Paragraph 6. Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.

Paragraph 7. Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.

Paragraph 8. Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.

Paragraph 9. Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.

Paragraph 10. Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.

Paragraph 11. Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.

Paragraph 12. Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.

## Final section

The end.

[^1]: The footnote text.
