/*
 * DebugOutput.h
 *
 *  Created on: 13 mrt. 2021
 *      Author: Mark
 */
#ifndef DEBUGOUTPUT_H_
#define DEBUGOUTPUT_H_

#include "Arduino.h"

class DebugOutput {
public:
	DebugOutput();
	DebugOutput(bool debug);
	virtual ~DebugOutput();
	void Var(const char* name, String value);
	void Var(const char* name, int value);
	void Var(const char* name, char value);
	void SetDebug(bool debug);
	bool GetDebug();
private:
	bool mDebug;
};

#endif /* DEBUGOUTPUT_H_ */
