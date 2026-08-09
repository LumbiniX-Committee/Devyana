import React from "react"
import "@fontsource/poppins/400.css"
import "@fontsource/poppins/500.css"
import "@fontsource/poppins/600.css"
import "@fontsource/poppins/700.css"
import "./setup.css"

export default function SetupPage() {
    return (
        <div className="vinaya-setup">
            <div className="vinaya-setup-card">
                <div className="vinaya-setup-mark" aria-hidden="true">
                    <span className="vinaya-setup-petal" />
                    <span className="vinaya-setup-petal vinaya-setup-petal-2" />
                    <span className="vinaya-setup-petal vinaya-setup-petal-3" />
                </div>
                <h1 className="vinaya-setup-title">Setup Vinaya Desktop</h1>
                <p className="vinaya-setup-body">
                    Please download and launch the Vinaya desktop application to continue. Once
                    it is running, return here and the extension will connect automatically.
                </p>
                <button
                    type="button"
                    className="vinaya-setup-button"
                    onClick={() => window.location.reload()}
                >
                    Check connection
                </button>
            </div>
        </div>
    )
}