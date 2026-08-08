const dummyInboxes = [
    {
        type: "system_warning",
        title: "Used YT for more than 1 hours",
        message: "You have used YT for more than a hour. Kindly close the website or request for urgent usage"
    }
]

function Inbox() {
    return (
        <>
            <h1 className="text-5xl">INBOX</h1>

            <br />

            {
                dummyInboxes.map((inbox, index) => {
                    return (
                        <div key={`inbox-${index}`} className="w-full p-2 border border-gray-200/50">
                            <input type="checkbox" title="Marked as read" />    <strong>{inbox.title}</strong> {inbox.message}
                        </div>
                    )
                })
            }

        </>
    )
}

export default Inbox