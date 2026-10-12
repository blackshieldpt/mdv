// SPDX-FileCopyrightText: 2026 BlackShield LDA
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useRef, useState } from 'react'
import type { AboutInfo } from '../../shared/types'

export function About({ onClose }: { onClose(): void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [info, setInfo] = useState<AboutInfo | null>(null)

  useEffect(() => {
    dialog.current!.showModal()
    window.mdv.about().then(setInfo)
  }, [])

  return (
    <dialog
      className="about"
      ref={dialog}
      onClose={onClose}
      onClick={(event) => event.target === dialog.current && dialog.current.close()}
    >
      <div className="about-body">
        <button className="about-close" aria-label="Close" onClick={() => dialog.current!.close()}>
          ×
        </button>
        <h1>mdv</h1>
        {info && (
          <>
            <p className="about-version">Version {info.version}</p>
            <p>
              Markdown viewer. Copyright 2026 BlackShield LDA.
              <br />
              Licensed under the Apache License, Version 2.0.
            </p>
            <dl>
              <dt>Electron</dt>
              <dd>{info.versions.electron}</dd>
              <dt>Chromium</dt>
              <dd>{info.versions.chrome}</dd>
              <dt>Node.js</dt>
              <dd>{info.versions.node}</dd>
              <dt>V8</dt>
              <dd>{info.versions.v8}</dd>
            </dl>
            <details>
              <summary>mdv license</summary>
              <pre>{info.license}</pre>
            </details>

            <h2>Third-party components</h2>
            <p>
              mdv includes the {info.components.length} components below, each under its own license. Chromium, Node.js
              and the other software bundled with Electron have a{' '}
              <button className="about-link" onClick={() => window.mdv.openChromiumLicenses()}>
                separate license list
              </button>
              .
            </p>
            <ul>
              {info.components.map((component) => (
                <li key={`${component.name}@${component.version}`}>
                  <details>
                    <summary>
                      <span className="about-name">{component.name}</span>
                      <span>{component.version}</span>
                      <span className="about-license">{component.license}</span>
                    </summary>
                    {component.url && (
                      <button className="about-link" onClick={() => window.mdv.openExternal(component.url!)}>
                        {component.url}
                      </button>
                    )}
                    <pre>{component.text ?? 'This package does not include a license text.'}</pre>
                  </details>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </dialog>
  )
}
