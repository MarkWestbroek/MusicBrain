/*
 * DebugOutput.h
 *
 *  Created on: 13 mrt. 2021
 *      Author: Mark
 */
#ifndef SESSIONDEBUGOUTPUT_H_
#define SESSIONDEBUGOUTPUT_H_

#include "Arduino.h"
#include "Channel.h"

class SessionDebugOutput {
public:
	SessionDebugOutput();
	SessionDebugOutput(bool debug);
	virtual ~SessionDebugOutput();
	void Var(const char* name, String value);
	void Var(const char* name, int value);
	void Var(const char* name, float value);
	void Var(const char* name, char value);
	void SetDebug(bool debug);
	bool GetDebug();
private:
	bool mDebug;
	Channel mChannel;
};

#endif /* SESSIONDEBUGOUTPUT_H_ */
