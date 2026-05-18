################################################################################
# Automatically-generated file. Do not edit!
################################################################################

-include ..\makefile.init

RM := -del 

# All of the sources participating in the build are defined here
-include sources.mk
-include subdir.mk
-include libraries\Wire\src\utility\subdir.mk
-include libraries\Wire\src\subdir.mk
-include core\core\subdir.mk
-include objects.mk

ifneq ($(MAKECMDGOALS),clean)
ifneq ($(strip $(CC_DEPS)),)
-include $(CC_DEPS)
endif
ifneq ($(strip $(C++_DEPS)),)
-include $(C++_DEPS)
endif
ifneq ($(strip $(C_UPPER_DEPS)),)
-include $(C_UPPER_DEPS)
endif
ifneq ($(strip $(CXX_DEPS)),)
-include $(CXX_DEPS)
endif
ifneq ($(strip $(ASM_DEPS)),)
-include $(ASM_DEPS)
endif
ifneq ($(strip $(INO_DEPS)),)
-include $(INO_DEPS)
endif
ifneq ($(strip $(PDE_DEPS)),)
-include $(PDE_DEPS)
endif
ifneq ($(strip $(S_UPPER_DEPS)),)
-include $(S_UPPER_DEPS)
endif
ifneq ($(strip $(CPP_DEPS)),)
-include $(CPP_DEPS)
endif
ifneq ($(strip $(C_DEPS)),)
-include $(C_DEPS)
endif
endif

-include ..\makefile.defs

# Add inputs and outputs from these tool invocations to the build variables 
AR += \
F:\Google\ Drive\Dev\[Arduino]\ADSR\v2\Release\arduino.ar \

ELF += \
AHDSR.elf \

HEX += \
AHDSR.hex \


# All Target
all: AHDSR

# Tool invocations
AHDSR: $(HEX)
	@echo 'Building target: $@'
	@echo 'Druk de grote af:'
	"B:\eclipse\arduinoPlugin\packages\arduino\tools\avr-gcc\7.3.0-atmel3.6.1-arduino7/bin/avr-size" -A "F:\Google Drive\Dev\[Arduino]\ADSR\v2\Release/AHDSR.elf"
	@echo 'Finished building target: $@'
	@echo ' '

F:\Google\ Drive\Dev\[Arduino]\ADSR\v2\Release\arduino.ar: $(AR_OBJ)
	@echo 'Start de archief bouwer'
	"B:\eclipse\arduinoPlugin\packages\arduino\tools\avr-gcc\7.3.0-atmel3.6.1-arduino7/bin/avr-gcc-ar" rcs     F:\Google Drive\Dev\[Arduino]\ADSR\v2\Release/arduino.ar $(AR_OBJ)
	@echo 'Finished building: $@'
	@echo ' '

AHDSR.elf: $(LINK_OBJ) $(AR)
	@echo 'Start de samenvoeger'
	"B:\eclipse\arduinoPlugin\packages\arduino\tools\avr-gcc\7.3.0-atmel3.6.1-arduino7/bin/avr-gcc" -Wall -Wextra -Os -g -flto -fuse-linker-plugin -Wl,--gc-sections -mmcu=atmega328p   -o "F:\Google Drive\Dev\[Arduino]\ADSR\v2\Release/AHDSR.elf"   $(LINK_OBJ)    F:\Google Drive\Dev\[Arduino]\ADSR\v2\Release/arduino.ar  "-LF:\Google Drive\Dev\[Arduino]\ADSR\v2\Release" -lm
	@echo 'Finished building: $@'
	@echo ' '

AHDSR.hex: $(ELF)
	@echo 'Voer alle objcopy opdrachten uit'
	"B:\eclipse\arduinoPlugin\packages\arduino\tools\avr-gcc\7.3.0-atmel3.6.1-arduino7/bin/avr-objcopy" -O ihex -j .eeprom --set-section-flags=.eeprom=alloc,load --no-change-warnings --change-section-lma .eeprom=0  "F:\Google Drive\Dev\[Arduino]\ADSR\v2\Release/AHDSR.elf" "F:\Google Drive\Dev\[Arduino]\ADSR\v2\Release/AHDSR.eep"
	"B:\eclipse\arduinoPlugin\packages\arduino\tools\avr-gcc\7.3.0-atmel3.6.1-arduino7/bin/avr-objcopy" -O ihex -R .eeprom  "F:\Google Drive\Dev\[Arduino]\ADSR\v2\Release/AHDSR.elf" "F:\Google Drive\Dev\[Arduino]\ADSR\v2\Release/AHDSR.hex"
	@echo 'Finished building: $@'
	@echo ' '

# Other Targets
clean:
	-$(RM) $(C_UPPER_DEPS)$(PDE_DEPS)$(C_DEPS)$(AR)$(CC_DEPS)$(AR_OBJ)$(C++_DEPS)$(LINK_OBJ)$(CXX_DEPS)$(ASM_DEPS)$(HEX)$(INO_DEPS)$(SIZEDUMMY)$(S_UPPER_DEPS)$(ELF)$(CPP_DEPS)
	-@echo ' '

.PHONY: all clean dependents

-include ..\makefile.targets
