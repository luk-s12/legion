# Component registry — `<project>`

Project-scoped architectural memory. The orchestrator writes it under the project mutex; agents
receive this resolved path and consult it before creating reusable components.

| Component | Type | Location | Problem it solves | Status | Reference |
|---|---|---|---|---|---|
