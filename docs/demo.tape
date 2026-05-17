# floweb demo — interactive browser automation via TUI
Set Theme "Dracula"
Set Width 1280
Set Height 720
Set Padding 20
Set Framerate 24

Hide
Type "pnpm start"
Sleep 250ms
Enter

# Wait for daemon + agent to initialize
Sleep 2s

Show
Sleep 1s

# Navigate to a website
Type "/open example.com"
Sleep 250ms
Enter
Sleep 3s

# Ask agent to describe the page
Type "what do you see on this page?"
Sleep 250ms
Enter
Sleep 4s

# Ask agent to take a screenshot
Type "take a screenshot"
Sleep 250ms
Enter
Sleep 3s

# List pages
Type "/pages"
Sleep 250ms
Enter
Sleep 2s

# Interact with the page
Type "click the first link"
Sleep 250ms
Enter
Sleep 3s
