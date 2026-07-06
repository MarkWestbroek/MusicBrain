```mermaid
classDiagram

  class ModuleType {
    <<entiteit>>
  }

  class Port {
    <<entiteit>>
  }

  class Knob {
    <<entiteit>>
  }

  class Switch {
    <<entiteit>>
  }

  class Display {
    <<entiteit>>
  }

  class Led {
    <<entiteit>>
  }

  class CellGroup {
    <<entiteit>>
  }

  class Panel {
    <<entiteit>>
  }

  class ControlPlacement {
    <<entiteit>>
  }

  class PortPlacement {
    <<entiteit>>
  }

  class PanelDecoration {
    <<entiteit>>
  }

  class ModuleInstance {
    <<entiteit>>
  }

  class FirmwareModule {
    <<entiteit>>
  }

  class Control {
    <<entiteit>>
  }

  class Slider {
    <<entiteit>>
  }

  class Toggle {
    <<entiteit>>
  }

  class Button {
    <<entiteit>>
  }

  class Joystick {
    <<entiteit>>
  }

  class Exotic {
    <<entiteit>>
  }

  class Indicator {
    <<entiteit>>
  }

  class read {
    <<entiteit>>
  }

  class nly {
    <<entiteit>>
  }

  class Vo {
    <<entiteit>>
  }

  class rstel {
    <<entiteit>>
  }

  class SimModule {
    <<entiteit>>
  }
  ModuleType "1" --> "1..*" Port
  ModuleType "1" --> "0..*" Control
  ModuleType "1" --> "0..*" CellGroup
  CellGroup "1" --> "0..*" Port : portIds (per cel)
  CellGroup "1" --> "0..*" Control : controlIds (per cel)
  Knob --|> Control
  Slider --|> Control
  Toggle --|> Control
  Switch --|> Control
  Button --|> Control
  Joystick --|> Control
  Exotic --|> Control
  Indicator --|> Control
  Display --|> Indicator
  Led --|> Indicator
  read "1" --> "0..*" nly : toont een Control-waarde
  Panel "1" --> "1" ModuleType : visualiseert
  Panel "1" --> "0..*" ControlPlacement
  Panel "1" --> "0..*" PortPlacement
  Panel "1" --> "0..*" PanelDecoration
  ControlPlacement "1" --> "1" Control : per id
  PortPlacement "1" --> "1" Port : per id
  Vo "1" --> "0..*" rstel : + minFirmwareVersion : semver
  ModuleInstance "1" --> "1" ModuleType : typeId
  ModuleInstance "1" --> "1" Panel : visual
  FirmwareModule --|> ModuleType
  SimModule --|> ModuleType`
  ```