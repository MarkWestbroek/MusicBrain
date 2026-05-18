///////////////////////////////////////////////////////////
//  Global.cpp
//  Implementation of the Class Global
//  Created on:      14-mrt-2021 23:31:45
//  Original author: Mark
///////////////////////////////////////////////////////////

#include "Global.h"
#include "Channel.h"
#include "DebugState.h"

Global::Global(){
	mDebugState = Off;

}

Global::Global(DebugState debugState){
	mDebugState = debugState;
}

Global::Initialise(){
	mDebugOutput = new DebugOutput(mDebugState, mChannel);
}


Global::~Global(){

}


void Global::SetDebugState(DebugState debugState){
	mDebugState = debugState;
}
DebugState Global::GetDebugState(){
	return  mDebugState;
}
void Global::Channel(Channel channel){
	mChannel = channel;
}
Channel Global::GetChannel(){
	return  mChannel;
}
