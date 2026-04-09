import React, { useEffect, useRef } from 'react';
import { ExtensionInfo } from '../../store/extensionStore';

interface PluginSandboxProps {
    plugin: ExtensionInfo;
    onMessage?: (message: any) => void;
}

/**
 * PluginSandbox component provides a strict <iframe> sandbox for running untrusted plugins.
 * Security measures:
 * 1. sandbox="allow-scripts" (strictly NO "allow-same-origin")
 * 2. communication via postMessage only
 * 3. NO access to parent cookies, localStorage, or __TAURI_INTERNALS__
 */
export const PluginSandbox: React.FC<PluginSandboxProps> = ({ plugin, onMessage }) => {
    const iframeRef = useRef<HTMLIFrameElement>(null);

    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            // Basic security check: verify message is from our iframe
            if (event.source !== iframeRef.current?.contentWindow) return;

            if (onMessage) {
                onMessage(event.data);
            }
        };

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, [onMessage]);

    const srcDoc = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body { margin: 0; padding: 0; overflow: hidden; background: transparent; color: white; font-family: sans-serif; }
        </style>
      </head>
      <body>
        <script>
          const ChiraHost = {
            send: (msg) => window.parent.postMessage(msg, '*'),
            on: (type, cb) => {
              window.addEventListener('message', (e) => {
                if (e.data.type === type) cb(e.data.payload);
              });
            }
          };
          
          (async () => {
            try {
              console.log('Plugin "${plugin.name}" sandbox initialized');
            } catch (err) {
              console.error('Plugin error:', err);
            }
          })();
        </script>
      </body>
    </html>
  `;

    return (
        <iframe
            ref={iframeRef}
            title={`Plugin: ${plugin.name}`}
            sandbox="allow-scripts"
            srcDoc={srcDoc}
            style={{
                width: '100%',
                height: '100%',
                border: 'none',
                background: 'transparent'
            }}
        />
    );
};
